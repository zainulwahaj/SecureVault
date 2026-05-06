"""
Versioning Service — File version management

When a file is re-uploaded the current content is saved as a version
before being overwritten.  Max versions per file is capped via settings.
"""

import uuid
from typing import Optional, Tuple, List
from sqlalchemy.orm import Session as DBSession
from app.config import get_settings
from app.models.file import File
from app.models.file_version import FileVersion
from app.services.storage import LocalStorageService

settings = get_settings()


class VersioningService:
    """Manages historical versions of encrypted files."""

    def __init__(self, db: DBSession):
        self.db = db
        self.storage = LocalStorageService()

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

        # Copy existing content to a version-specific storage path
        version_id = str(uuid.uuid4())
        version_storage_path = f"{file.user_id}/versions/{version_id}"

        content, err = await self.storage.read_file(file.user_id, file.id)
        if err:
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
        # version storage_path is "{user_id}/versions/{version_id}"
        parts = version.storage_path.split("/", 1)
        if len(parts) != 2:
            return None, "Invalid version storage path"
        return await self.storage.read_file(parts[0], parts[1])

    async def delete_version(self, version: FileVersion, user_id: str) -> None:
        """Permanently delete a single version."""
        parts = version.storage_path.split("/", 1)
        if len(parts) == 2:
            await self.storage.delete_file(parts[0], parts[1])
        self.db.delete(version)
        self.db.commit()

    async def delete_all_versions(self, file: File) -> None:
        """Delete every version of a file."""
        versions = self.get_versions(file)
        for v in versions:
            parts = v.storage_path.split("/", 1)
            if len(parts) == 2:
                await self.storage.delete_file(parts[0], parts[1])
            self.db.delete(v)
        self.db.commit()

    # ------------------------------------------------------------------

    async def _enforce_cap(self, file: File) -> None:
        """Remove the oldest versions if we exceed MAX_FILE_VERSIONS."""
        versions = (
            self.db.query(FileVersion)
            .filter(FileVersion.file_id == file.id)
            .order_by(FileVersion.version_number.asc())
            .all()
        )
        excess = len(versions) - settings.MAX_FILE_VERSIONS
        for v in versions[:max(0, excess)]:
            parts = v.storage_path.split("/", 1)
            if len(parts) == 2:
                await self.storage.delete_file(parts[0], parts[1])
            self.db.delete(v)
