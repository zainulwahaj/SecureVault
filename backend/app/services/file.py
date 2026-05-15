"""
File Storage Service — Zero-Knowledge Encrypted File Storage

SECURITY PRINCIPLES:
1. Backend NEVER decrypts files
2. Backend NEVER sees original filenames
3. Files stored with UUID names only
4. All metadata is encrypted client-side
5. Backend is cryptographically blind to file contents
"""

import hashlib
import uuid
from datetime import datetime, timedelta
from typing import Optional, Tuple, List, Dict, Any
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import func, or_
from app.models.file import File
from app.models.file_version import FileVersion
from app.models.file_upload import FileUploadSession, FileChunk
from app.models.shared_file import SharedFile
from app.models.shared_link import SharedLink
from app.models.user import User
from app.services.folder import FolderService
from app.services.storage import LocalStorageService
from app.services.policy import policy_for
from app.config import get_settings

settings = get_settings()


class FileService:
    """
    Zero-Knowledge File Storage Service.

    Stores only encrypted blobs (cannot decrypt).
    Uses UUID for storage paths (no filename leakage).
    Validates ownership for all operations.
    """

    def __init__(self, db: DBSession):
        self.db = db
        self.storage = LocalStorageService()

    @staticmethod
    def content_hash(content: bytes) -> str:
        return hashlib.sha256(content).hexdigest()

    def get_usage(self, user: User) -> Dict[str, int]:
        """Return physical storage usage, including trash and retained versions."""
        file_bytes = self.db.query(func.sum(File.encrypted_size)).filter(
            File.user_id == user.id,
        ).scalar() or 0

        version_bytes = self.db.query(func.sum(FileVersion.encrypted_size)).join(
            File, FileVersion.file_id == File.id,
        ).filter(File.user_id == user.id).scalar() or 0

        pending_upload_bytes = self.db.query(func.sum(FileChunk.encrypted_size)).filter(
            FileChunk.user_id == user.id,
            FileChunk.file_id.is_(None),
            FileChunk.version_id.is_(None),
        ).scalar() or 0

        active_count = self.db.query(File).filter(
            File.user_id == user.id,
            File.deleted_at.is_(None),
        ).count()

        return {
            "usedBytes": int(file_bytes + version_bytes + pending_upload_bytes),
            "fileBytes": int(file_bytes),
            "versionBytes": int(version_bytes),
            "fileCount": int(active_count),
        }

    def _validate_folder(self, user: User, folder_id: Optional[str]) -> Optional[str]:
        if not folder_id:
            return None
        if not FolderService(self.db).get_folder(folder_id, user.id):
            return "Target folder not found"
        return None

    def _lock_user_quota_row(self, user: User) -> None:
        self.db.query(User).filter(User.id == user.id).with_for_update().first()

    def _validate_quota(
        self,
        user: User,
        additional_bytes: int,
        additional_files: int = 0,
    ) -> Optional[str]:
        policy = policy_for(user)
        usage = self.get_usage(user)
        if usage["usedBytes"] + additional_bytes > policy.storage_bytes:
            return "Storage quota exceeded"
        if usage["fileCount"] + additional_files > policy.max_file_count:
            return "File count limit exceeded"
        if additional_bytes > policy.max_file_bytes:
            return "File exceeds per-file size limit"
        return None

    def _has_active_access_envelopes(self, file: File) -> bool:
        now = datetime.utcnow()
        active_share = self.db.query(SharedFile).filter(
            SharedFile.file_id == file.id,
            SharedFile.revoked_at.is_(None),
            or_(SharedFile.expires_at.is_(None), SharedFile.expires_at > now),
        ).first()
        if active_share:
            return True

        active_link = self.db.query(SharedLink).filter(
            SharedLink.file_id == file.id,
            SharedLink.is_active.is_(True),
            or_(SharedLink.expires_at.is_(None), SharedLink.expires_at > now),
            or_(SharedLink.max_downloads.is_(None), SharedLink.download_count < SharedLink.max_downloads),
        ).first()
        return active_link is not None

    async def save_file(
        self,
        user: User,
        encrypted_content: bytes,
        encrypted_file_key: Dict[str, Any],
        encrypted_filename: Dict[str, Any],
        encrypted_mime_type: Optional[Dict[str, Any]] = None,
        folder_id: Optional[str] = None,
    ) -> Tuple[Optional[File], Optional[str]]:
        """Save an encrypted file. Returns (file_record, error)."""
        file_id = str(uuid.uuid4())

        try:
            folder_error = self._validate_folder(user, folder_id)
            if folder_error:
                return None, folder_error

            self._lock_user_quota_row(user)
            quota_error = self._validate_quota(user, len(encrypted_content), additional_files=1)
            if quota_error:
                return None, quota_error

            content_sha256 = self.content_hash(encrypted_content)
            await self.storage.save_file(user.id, file_id, encrypted_content)
            storage_path = f"{user.id}/{file_id}"

            file_record = File(
                id=file_id,
                user_id=user.id,
                encrypted_file_key=encrypted_file_key,
                encrypted_filename=encrypted_filename,
                encrypted_mime_type=encrypted_mime_type,
                storage_path=storage_path,
                encrypted_size=len(encrypted_content),
                content_sha256=content_sha256,
                folder_id=folder_id,
            )

            self.db.add(file_record)
            self.db.commit()
            self.db.refresh(file_record)
            return file_record, None

        except Exception as e:
            self.db.rollback()
            await self.storage.delete_file(user.id, file_id)
            return None, f"Failed to save file: {e}"

    async def replace_file_content(
        self,
        file_record: File,
        encrypted_content: bytes,
        encrypted_file_key: Dict[str, Any],
        encrypted_filename: Dict[str, Any],
        encrypted_mime_type: Optional[Dict[str, Any]] = None,
    ) -> Tuple[Optional[File], Optional[str]]:
        """
        Replace a file with new encrypted content and retain the old content as a version.

        Existing share/link envelopes are bound to the old FileKey, so replacement
        is blocked while active recipients or public links exist.
        """
        if self._has_active_access_envelopes(file_record):
            return None, "Revoke active shares and links before replacing this file"

        self._lock_user_quota_row(file_record.user)
        quota_error = self._validate_quota(file_record.user, len(encrypted_content), additional_files=0)
        if quota_error:
            return None, quota_error

        from app.services.versioning import VersioningService

        try:
            version = await VersioningService(self.db).create_version_from_current(file_record)
            if not version:
                return None, "Could not create file version"

            content_sha256 = self.content_hash(encrypted_content)
            await self.storage.save_file(file_record.user_id, file_record.id, encrypted_content)

            file_record.encrypted_file_key = encrypted_file_key
            file_record.encrypted_filename = encrypted_filename
            file_record.encrypted_mime_type = encrypted_mime_type
            file_record.storage_path = f"{file_record.user_id}/{file_record.id}"
            file_record.encrypted_size = len(encrypted_content)
            file_record.content_sha256 = content_sha256
            file_record.storage_mode = "single"
            file_record.chunk_manifest = None
            self.db.commit()
            self.db.refresh(file_record)
            return file_record, None
        except Exception as e:
            self.db.rollback()
            return None, f"Failed to replace file: {e}"

    def _manifest_hash(self, manifest: Dict[str, Any]) -> str:
        import json
        encoded = json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()

    async def purge_stale_uploads(self, user: User, older_than_hours: int = 24) -> int:
        """Abort stale active upload sessions and remove staged chunks."""
        cutoff = datetime.utcnow() - timedelta(hours=older_than_hours)
        stale = self.db.query(FileUploadSession).filter(
            FileUploadSession.user_id == user.id,
            FileUploadSession.status == "active",
            FileUploadSession.created_at < cutoff,
        ).all()
        count = 0
        for upload in stale:
            chunks = self.db.query(FileChunk).filter(FileChunk.upload_id == upload.id).all()
            for chunk in chunks:
                parts = chunk.storage_path.split("/", 1)
                if len(parts) == 2:
                    await self.storage.delete_object(parts[0], parts[1])
                self.db.delete(chunk)
            upload.status = "aborted"
            upload.aborted_at = datetime.utcnow()
            count += 1
        if count:
            self.db.commit()
        return count

    async def create_upload_session(
        self,
        user: User,
        metadata: Dict[str, Any],
        total_parts: int,
        total_size: int,
        chunk_size: int,
        folder_id: Optional[str] = None,
        idempotency_key: Optional[str] = None,
    ) -> Tuple[Optional[FileUploadSession], Optional[str]]:
        """Create a resumable upload session for encrypted chunks."""
        await self.purge_stale_uploads(user)
        folder_error = self._validate_folder(user, folder_id)
        if folder_error:
            return None, folder_error
        if total_size > policy_for(user).max_file_bytes:
            return None, "File too large"
        self._lock_user_quota_row(user)
        quota_error = self._validate_quota(user, total_size, additional_files=1)
        if quota_error:
            return None, quota_error

        if idempotency_key:
            existing = self.db.query(FileUploadSession).filter(
                FileUploadSession.user_id == user.id,
                FileUploadSession.idempotency_key == idempotency_key,
            ).first()
            if existing:
                return existing, None

        upload = FileUploadSession(
            user_id=user.id,
            file_id=str(uuid.uuid4()),
            folder_id=folder_id,
            idempotency_key=idempotency_key,
            encrypted_file_key=metadata["encrypted_file_key"],
            encrypted_filename=metadata["encrypted_filename"],
            encrypted_mime_type=metadata.get("encrypted_mime_type"),
            total_parts=total_parts,
            total_size=total_size,
            chunk_size=chunk_size,
            status="active",
        )
        self.db.add(upload)
        self.db.commit()
        self.db.refresh(upload)
        return upload, None

    async def save_upload_part(
        self,
        upload_id: str,
        user: User,
        part_number: int,
        encrypted_content: bytes,
    ) -> Tuple[Optional[FileChunk], Optional[str]]:
        """Store or replace one encrypted upload chunk."""
        upload = self.db.query(FileUploadSession).filter(
            FileUploadSession.id == upload_id,
            FileUploadSession.user_id == user.id,
            FileUploadSession.status == "active",
        ).first()
        if not upload:
            return None, "Upload session not found"
        if part_number < 0 or part_number >= upload.total_parts:
            return None, "Invalid part number"
        if len(encrypted_content) == 0:
            return None, "Empty upload part"
        if len(encrypted_content) > upload.chunk_size + 1024 * 1024:
            return None, "Upload part too large"

        object_key = f"uploads/{upload.id}/parts/{part_number}"
        content_sha256 = self.content_hash(encrypted_content)
        existing = self.db.query(FileChunk).filter(
            FileChunk.upload_id == upload.id,
            FileChunk.part_number == part_number,
        ).first()

        await self.storage.put_part(user.id, object_key, encrypted_content)
        if existing:
            existing.storage_path = f"{user.id}/{object_key}"
            existing.encrypted_size = len(encrypted_content)
            existing.content_sha256 = content_sha256
            chunk = existing
        else:
            chunk = FileChunk(
                upload_id=upload.id,
                user_id=user.id,
                part_number=part_number,
                storage_path=f"{user.id}/{object_key}",
                encrypted_size=len(encrypted_content),
                content_sha256=content_sha256,
            )
            self.db.add(chunk)
        self.db.commit()
        self.db.refresh(chunk)
        return chunk, None

    async def complete_upload_session(
        self,
        upload_id: str,
        user: User,
        client_manifest: Optional[Dict[str, Any]] = None,
    ) -> Tuple[Optional[File], Optional[str]]:
        """Validate all encrypted chunks and atomically create a file record."""
        upload = self.db.query(FileUploadSession).filter(
            FileUploadSession.id == upload_id,
            FileUploadSession.user_id == user.id,
            FileUploadSession.status == "active",
        ).with_for_update().first()
        if not upload:
            return None, "Upload session not found"

        chunks = self.db.query(FileChunk).filter(
            FileChunk.upload_id == upload.id,
        ).order_by(FileChunk.part_number.asc()).all()
        if len(chunks) != upload.total_parts:
            return None, "Upload is missing parts"
        expected_numbers = list(range(upload.total_parts))
        if [chunk.part_number for chunk in chunks] != expected_numbers:
            return None, "Upload parts are incomplete"

        encrypted_size = 0
        for chunk in chunks:
            pieces = chunk.storage_path.split("/", 1)
            if len(pieces) != 2:
                return None, "Invalid chunk storage path"
            stored, error = await self.storage.get_part(pieces[0], pieces[1])
            if error or stored is None:
                return None, error or "Upload part not found on disk"
            if len(stored) != chunk.encrypted_size:
                return None, "Upload part size mismatch on disk"
            if self.content_hash(stored) != chunk.content_sha256:
                return None, "Upload part checksum mismatch on disk"
            encrypted_size += chunk.encrypted_size
        if encrypted_size != upload.total_size:
            return None, "Upload size mismatch"

        self._lock_user_quota_row(user)
        # Pending chunk bytes are already counted in get_usage(); completion only
        # adds a logical file record. Avoid rejecting valid uploads by counting
        # the same bytes twice.
        quota_error = self._validate_quota(user, 0, additional_files=1)
        if quota_error:
            return None, quota_error

        manifest = {
            "version": 1,
            "storageMode": "chunked",
            "chunkSize": upload.chunk_size,
            "totalParts": upload.total_parts,
            "encryptedSize": encrypted_size,
            "clientManifest": client_manifest or {},
            "parts": [
                {
                    "partNumber": chunk.part_number,
                    "storagePath": chunk.storage_path,
                    "encryptedSize": chunk.encrypted_size,
                    "encryptedSha256": chunk.content_sha256,
                }
                for chunk in chunks
            ],
        }
        manifest_sha256 = self._manifest_hash(manifest)
        file_record = File(
            id=upload.file_id,
            user_id=user.id,
            encrypted_file_key=upload.encrypted_file_key,
            encrypted_filename=upload.encrypted_filename,
            encrypted_mime_type=upload.encrypted_mime_type,
            storage_path=f"{user.id}/manifests/{upload.file_id}.json",
            encrypted_size=encrypted_size,
            content_sha256=manifest_sha256,
            storage_mode="chunked",
            chunk_manifest=manifest,
            folder_id=upload.folder_id,
        )
        self.db.add(file_record)
        for chunk in chunks:
            chunk.file_id = file_record.id
            chunk.upload_id = None
        upload.status = "completed"
        upload.completed_at = datetime.utcnow()
        upload.manifest = manifest
        self.db.commit()
        self.db.refresh(file_record)
        return file_record, None

    async def abort_upload_session(self, upload_id: str, user: User) -> Tuple[bool, Optional[str]]:
        """Abort an upload and delete all staged encrypted chunks."""
        upload = self.db.query(FileUploadSession).filter(
            FileUploadSession.id == upload_id,
            FileUploadSession.user_id == user.id,
            FileUploadSession.status == "active",
        ).first()
        if not upload:
            return False, "Upload session not found"
        chunks = self.db.query(FileChunk).filter(FileChunk.upload_id == upload.id).all()
        for chunk in chunks:
            parts = chunk.storage_path.split("/", 1)
            if len(parts) == 2:
                await self.storage.delete_object(parts[0], parts[1])
            self.db.delete(chunk)
        upload.status = "aborted"
        upload.aborted_at = datetime.utcnow()
        self.db.commit()
        return True, None

    async def rotate_file_content(
        self,
        file_record: File,
        owner: User,
        encrypted_content: bytes,
        encrypted_file_key: Dict[str, Any],
        encrypted_filename: Optional[Dict[str, Any]],
        encrypted_mime_type: Optional[Dict[str, Any]],
        recipient_envelopes: List[Dict[str, Any]],
    ) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        """Atomically rewrap a file under a fresh FileKey and rotate envelopes.

        Performs the strong-revocation rewrap: swaps the stored ciphertext,
        updates encrypted metadata, then hands off to SharingService to revoke
        old envelopes and write new ones for the remaining recipients.
        Public links are deactivated because their wrap is bound to the old
        FileKey.
        """
        policy = policy_for(owner)
        if len(encrypted_content) > policy.max_file_bytes:
            return None, "File too large"

        self._lock_user_quota_row(owner)
        delta = len(encrypted_content) - (file_record.encrypted_size or 0)
        if delta > 0:
            usage = self.get_usage(owner)
            if usage["usedBytes"] + delta > policy.storage_bytes:
                return None, "Storage quota exceeded"

        from app.services.sharing import SharingService

        try:
            content_sha256 = self.content_hash(encrypted_content)
            await self.storage.save_file(file_record.user_id, file_record.id, encrypted_content)

            file_record.encrypted_file_key = encrypted_file_key
            if encrypted_filename is not None:
                file_record.encrypted_filename = encrypted_filename
            if encrypted_mime_type is not None:
                file_record.encrypted_mime_type = encrypted_mime_type
            file_record.storage_path = f"{file_record.user_id}/{file_record.id}"
            file_record.encrypted_size = len(encrypted_content)
            file_record.content_sha256 = content_sha256
            file_record.storage_mode = "single"
            file_record.chunk_manifest = None

            summary, error = SharingService(self.db).rotate_file_envelopes(
                file=file_record,
                owner=owner,
                recipient_envelopes=recipient_envelopes,
            )
            if error:
                self.db.rollback()
                return None, error

            self.db.commit()
            self.db.refresh(file_record)
            return summary, None
        except Exception as e:
            self.db.rollback()
            return None, f"Failed to rotate file: {e}"

    def get_file_by_id(self, file_id: str, user_id: str) -> Optional[File]:
        """Get a file record verifying ownership."""
        return self.db.query(File).filter(
            File.id == file_id,
            File.user_id == user_id,
            File.deleted_at.is_(None),
        ).first()

    def list_files(
        self,
        user: User,
        folder_id: Optional[str] = None,
        include_trashed: bool = False,
    ) -> List[File]:
        """List files for a user, optionally within a folder."""
        q = self.db.query(File).filter(File.user_id == user.id)

        if not include_trashed:
            q = q.filter(File.deleted_at.is_(None))

        if folder_id is not None:
            q = q.filter(File.folder_id == folder_id)
        else:
            q = q.filter(File.folder_id.is_(None))

        return q.order_by(File.created_at.desc()).all()

    def list_all_files(self, user: User) -> List[File]:
        """List all non-trashed files regardless of folder."""
        return self.db.query(File).filter(
            File.user_id == user.id,
            File.deleted_at.is_(None),
        ).order_by(File.created_at.desc()).all()

    async def read_file_content(self, file_record: File) -> Tuple[Optional[bytes], Optional[str]]:
        """Read encrypted file content from storage."""
        if getattr(file_record, "storage_mode", "single") == "chunked":
            manifest = file_record.chunk_manifest or {}
            chunks = []
            for part in manifest.get("parts", []):
                storage_path = part.get("storagePath", "")
                pieces = storage_path.split("/", 1)
                if len(pieces) != 2:
                    return None, "Invalid chunk storage path"
                content, error = await self.storage.get_part(pieces[0], pieces[1])
                if error or content is None:
                    return None, error or "Chunk not found on disk"
                if len(content) != part.get("encryptedSize"):
                    return None, "Stored encrypted chunk size mismatch"
                if self.content_hash(content) != part.get("encryptedSha256"):
                    return None, "Stored encrypted chunk checksum mismatch"
                chunks.append(content)
            combined = b"".join(chunks)
            if len(combined) != file_record.encrypted_size:
                return None, "Stored encrypted file size mismatch"
            return combined, None

        content, error = await self.storage.read_file(file_record.user_id, file_record.id)
        if error:
            return None, error
        if content is None:
            return None, "File not found on disk"
        if len(content) != file_record.encrypted_size:
            return None, "Stored encrypted file size mismatch"
        if file_record.content_sha256 and self.content_hash(content) != file_record.content_sha256:
            return None, "Stored encrypted file checksum mismatch"
        return content, None

    async def delete_file(self, file_record: File) -> Tuple[bool, Optional[str]]:
        """Permanently delete a file and its DB record."""
        try:
            for version in list(file_record.versions):
                if getattr(version, "storage_mode", "single") == "chunked" and version.chunk_manifest:
                    for part in version.chunk_manifest.get("parts", []):
                        pieces = part.get("storagePath", "").split("/", 1)
                        if len(pieces) == 2:
                            await self.storage.delete_file(pieces[0], pieces[1])
                else:
                    parts = version.storage_path.split("/", 1)
                    if len(parts) == 2:
                        await self.storage.delete_file(parts[0], parts[1])
            if getattr(file_record, "storage_mode", "single") == "chunked" and file_record.chunk_manifest:
                for part in file_record.chunk_manifest.get("parts", []):
                    pieces = part.get("storagePath", "").split("/", 1)
                    if len(pieces) == 2:
                        await self.storage.delete_file(pieces[0], pieces[1])
            else:
                await self.storage.delete_file(file_record.user_id, file_record.id)
            self.db.delete(file_record)
            self.db.commit()
            return True, None
        except Exception as e:
            self.db.rollback()
            return False, f"Failed to delete file: {e}"

    def get_file_count(self, user: User) -> int:
        return self.db.query(File).filter(
            File.user_id == user.id,
            File.deleted_at.is_(None),
        ).count()

    def get_total_size(self, user: User) -> int:
        return self.get_usage(user)["usedBytes"]
