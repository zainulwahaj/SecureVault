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
            # Remove retained version objects.
            for v in list(file.versions):
                if getattr(v, "storage_mode", "single") == "chunked" and v.chunk_manifest:
                    for part in v.chunk_manifest.get("parts", []):
                        pieces = part.get("storagePath", "").split("/", 1)
                        if len(pieces) == 2:
                            await self.storage.delete_file(pieces[0], pieces[1])
                else:
                    parts = v.storage_path.split("/", 1)
                    if len(parts) == 2:
                        await self.storage.delete_file(parts[0], parts[1])

            # Remove the main file blob or chunk objects.
            if getattr(file, "storage_mode", "single") == "chunked" and file.chunk_manifest:
                for part in file.chunk_manifest.get("parts", []):
                    pieces = part.get("storagePath", "").split("/", 1)
                    if len(pieces) == 2:
                        await self.storage.delete_file(pieces[0], pieces[1])
            else:
                await self.storage.delete_file(file.user_id, file.id)

            self.db.delete(file)
            self.db.commit()
            return True, None
        except Exception as e:
            self.db.rollback()
            return False, str(e)

    async def auto_purge(self) -> int:
        """Permanently delete trashed files past each user's retention policy.

        Per-account retention can differ via the plan layer, so we evaluate
        the cutoff per file rather than globally.
        """
        from app.services.policy import policy_for
        now = datetime.now(timezone.utc)
        # Evaluate against the most generous policy as a coarse filter so we
        # don't scan every soft-deleted row, then check each candidate exactly.
        max_retention_days = max(
            (policy_for(file.user).max_trash_days for file in
             self.db.query(File).filter(File.deleted_at.isnot(None)).all()),
            default=settings.TRASH_RETENTION_DAYS,
        )
        coarse_cutoff = now - timedelta(days=max_retention_days)
        candidates = (
            self.db.query(File)
            .filter(
                File.deleted_at.isnot(None),
                File.deleted_at < coarse_cutoff,
            )
            .all()
        )
        count = 0
        for file in candidates:
            retention_days = policy_for(file.user).max_trash_days or settings.TRASH_RETENTION_DAYS
            deleted_at = file.deleted_at
            if deleted_at is None:
                continue
            if deleted_at.tzinfo is None:
                deleted_at = deleted_at.replace(tzinfo=timezone.utc)
            if deleted_at >= now - timedelta(days=retention_days):
                continue
            ok, _ = await self.permanent_delete(file)
            if ok:
                count += 1
        return count
