"""
Versioning Service — File version management

When a file is re-uploaded the current content is saved as a version
before being overwritten.  Max versions per file is capped via settings.
"""

import uuid
from typing import Optional, Tuple, List, Dict, Any
from sqlalchemy.orm import Session as DBSession
from app.config import get_settings
from app.models.file import File
from app.models.file_version import FileVersion
from app.models.file_upload import FileChunk
from app.services.file import FileService
from app.services.storage import LocalStorageService

settings = get_settings()


class VersioningService:
    """Manages historical versions of encrypted files."""

    def __init__(self, db: DBSession):
        self.db = db
        self.storage = LocalStorageService()

    @staticmethod
    def _chunk_parts(manifest: Dict[str, Any]) -> list[dict[str, Any]]:
        return manifest.get("parts", []) if manifest else []

    async def _delete_chunk_manifest(self, manifest: Dict[str, Any]) -> None:
        for part in self._chunk_parts(manifest):
            pieces = part.get("storagePath", "").split("/", 1)
            if len(pieces) == 2:
                await self.storage.delete_file(pieces[0], pieces[1])

    def get_versions(self, file: File) -> List[FileVersion]:
        """List all versions of a file newest-first."""
        return (
            self.db.query(FileVersion)
            .filter(FileVersion.file_id == file.id)
            .order_by(FileVersion.version_number.desc())
            .all()
        )

    def get_version(self, file: File, version_number: int) -> Optional[FileVersion]:
        """Get a specific version of a file."""
        return (
            self.db.query(FileVersion)
            .filter(
                FileVersion.file_id == file.id,
                FileVersion.version_number == version_number,
            )
            .first()
        )

    async def create_version_from_current(self, file: File) -> Optional[FileVersion]:
        """
        Snapshot the current file content as a new version.

        Called before overwriting a file with new content.
        Also enforces the version cap.
        """
        latest = (
            self.db.query(FileVersion)
            .filter(FileVersion.file_id == file.id)
            .order_by(FileVersion.version_number.desc())
            .first()
        )
        next_number = (latest.version_number + 1) if latest else 1

        version_id = str(uuid.uuid4())

        if getattr(file, "storage_mode", "single") == "chunked" and file.chunk_manifest:
            version_storage_path = file.storage_path
            version = FileVersion(
                id=version_id,
                file_id=file.id,
                version_number=next_number,
                storage_path=version_storage_path,
                encrypted_file_key=file.encrypted_file_key,
                encrypted_size=file.encrypted_size,
                content_sha256=file.content_sha256,
                storage_mode="chunked",
                chunk_manifest=file.chunk_manifest,
            )
            self.db.add(version)
            self.db.flush()
            self.db.query(FileChunk).filter(FileChunk.file_id == file.id).update(
                {"file_id": None, "version_id": version.id},
                synchronize_session=False,
            )
        else:
            version_storage_path = f"{file.user_id}/versions/{version_id}"
            content, err = await self.storage.read_file(file.user_id, file.id)
            if err:
                return None
            if content is None:
                return None
            if file.content_sha256 and FileService.content_hash(content) != file.content_sha256:
                return None

            await self.storage.save_file(
                file.user_id,
                f"versions/{version_id}",
                content,
            )

            version = FileVersion(
                id=version_id,
                file_id=file.id,
                version_number=next_number,
                storage_path=version_storage_path,
                encrypted_file_key=file.encrypted_file_key,
                encrypted_size=file.encrypted_size,
                content_sha256=FileService.content_hash(content),
                storage_mode="single",
            )
            self.db.add(version)
            self.db.flush()

        # Enforce cap
        await self._enforce_cap(file)

        self.db.commit()
        self.db.refresh(version)
        return version

    async def read_version_content(
        self, version: FileVersion, user_id: str,
    ) -> Tuple[Optional[bytes], Optional[str]]:
        """Read the encrypted content of a historical version."""
        if getattr(version, "storage_mode", "single") == "chunked" and version.chunk_manifest:
            chunks = []
            for part in self._chunk_parts(version.chunk_manifest):
                pieces = part.get("storagePath", "").split("/", 1)
                if len(pieces) != 2:
                    return None, "Invalid version chunk storage path"
                content, error = await self.storage.read_file(pieces[0], pieces[1])
                if error or content is None:
                    return None, error or "Version chunk not found on disk"
                if len(content) != part.get("encryptedSize"):
                    return None, "Stored encrypted version chunk size mismatch"
                if FileService.content_hash(content) != part.get("encryptedSha256"):
                    return None, "Stored encrypted version chunk checksum mismatch"
                chunks.append(content)
            combined = b"".join(chunks)
            if len(combined) != version.encrypted_size:
                return None, "Stored encrypted version size mismatch"
            return combined, None

        parts = version.storage_path.split("/", 1)
        if len(parts) != 2:
            return None, "Invalid version storage path"
        content, error = await self.storage.read_file(parts[0], parts[1])
        if error:
            return None, error
        if content is None:
            return None, "Version not found on disk"
        if len(content) != version.encrypted_size:
            return None, "Stored encrypted version size mismatch"
        if version.content_sha256 and FileService.content_hash(content) != version.content_sha256:
            return None, "Stored encrypted version checksum mismatch"
        return content, None

    async def delete_version(self, version: FileVersion, user_id: str) -> None:
        """Permanently delete a single version."""
        if getattr(version, "storage_mode", "single") == "chunked" and version.chunk_manifest:
            await self._delete_chunk_manifest(version.chunk_manifest)
        else:
            parts = version.storage_path.split("/", 1)
            if len(parts) == 2:
                await self.storage.delete_file(parts[0], parts[1])
        self.db.delete(version)
        self.db.commit()

    async def delete_all_versions(self, file: File) -> None:
        """Delete every version of a file."""
        versions = self.get_versions(file)
        for v in versions:
            if getattr(v, "storage_mode", "single") == "chunked" and v.chunk_manifest:
                await self._delete_chunk_manifest(v.chunk_manifest)
            else:
                parts = v.storage_path.split("/", 1)
                if len(parts) == 2:
                    await self.storage.delete_file(parts[0], parts[1])
            self.db.delete(v)
        self.db.commit()

    # ------------------------------------------------------------------

    async def _enforce_cap(self, file: File) -> None:
        """Remove the oldest versions if we exceed the user's plan cap."""
        from app.services.policy import policy_for
        versions = (
            self.db.query(FileVersion)
            .filter(FileVersion.file_id == file.id)
            .order_by(FileVersion.version_number.asc())
            .all()
        )
        cap = policy_for(file.user).max_versions_per_file
        if cap <= 0:
            cap = settings.MAX_FILE_VERSIONS
        excess = len(versions) - cap
        for v in versions[:max(0, excess)]:
            if getattr(v, "storage_mode", "single") == "chunked" and v.chunk_manifest:
                await self._delete_chunk_manifest(v.chunk_manifest)
            else:
                parts = v.storage_path.split("/", 1)
                if len(parts) == 2:
                    await self.storage.delete_file(parts[0], parts[1])
            self.db.delete(v)
