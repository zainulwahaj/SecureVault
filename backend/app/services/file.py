"""
File Storage Service — Zero-Knowledge Encrypted File Storage

SECURITY PRINCIPLES:
1. Backend NEVER decrypts files
2. Backend NEVER sees original filenames
3. Files stored with UUID names only
4. All metadata is encrypted client-side
5. Backend is cryptographically blind to file contents
"""

import uuid
from typing import Optional, Tuple, List, Dict, Any
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import func
from app.models.file import File
from app.models.user import User
from app.services.storage import LocalStorageService


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
        return await self.storage.read_file(file_record.user_id, file_record.id)

    async def delete_file(self, file_record: File) -> Tuple[bool, Optional[str]]:
        """Permanently delete a file and its DB record."""
        try:
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
        result = self.db.query(func.sum(File.encrypted_size)).filter(
            File.user_id == user.id,
            File.deleted_at.is_(None),
        ).scalar()
        return result or 0
