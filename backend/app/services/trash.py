"""
Trash Service — Soft-delete and auto-purge

Files are soft-deleted (deleted_at set). After TRASH_RETENTION_DAYS they
are permanently purged by the background task in main.py.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple, List
from sqlalchemy.orm import Session as DBSession
from app.config import get_settings
from app.models.file import File
from app.models.user import User
from app.services.storage import LocalStorageService

settings = get_settings()


class TrashService:
    """Manages the trash-bin lifecycle for files."""

    def __init__(self, db: DBSession):
        self.db = db
        self.storage = LocalStorageService()

    def trash_file(self, file: File) -> File:
        """Soft-delete a file by setting deleted_at."""
        file.deleted_at = datetime.now(timezone.utc)
        self.db.commit()
        self.db.refresh(file)
        return file

    def restore_file(self, file: File) -> File:
        """Remove soft-delete flag."""
        file.deleted_at = None
        self.db.commit()
        self.db.refresh(file)
        return file

    def list_trashed(self, user: User) -> List[File]:
        """List all trashed files for a user."""
        return (
            self.db.query(File)
            .filter(
                File.user_id == user.id,
                File.deleted_at.isnot(None),
            )
            .order_by(File.deleted_at.desc())
            .all()
        )

    async def permanent_delete(self, file: File) -> Tuple[bool, Optional[str]]:
        """Permanently delete a trashed file (storage + versions + DB)."""
        try:
            # Remove version files
            for v in list(file.versions):
                parts = v.storage_path.split("/", 1)
                if len(parts) == 2:
                    await self.storage.delete_file(parts[0], parts[1])

            # Remove the main file blob
            await self.storage.delete_file(file.user_id, file.id)

            self.db.delete(file)
            self.db.commit()
            return True, None
        except Exception as e:
            self.db.rollback()
            return False, str(e)

    async def auto_purge(self) -> int:
        """Permanently delete files trashed longer than TRASH_RETENTION_DAYS.

        Called periodically by the background loop in main.py.
        Returns number of purged files.
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=settings.TRASH_RETENTION_DAYS)
        expired = (
            self.db.query(File)
            .filter(
                File.deleted_at.isnot(None),
                File.deleted_at < cutoff,
            )
            .all()
        )
        count = 0
        for file in expired:
            ok, _ = await self.permanent_delete(file)
            if ok:
                count += 1
        return count
