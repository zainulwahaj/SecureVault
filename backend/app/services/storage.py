"""
Local File Storage Service

Stores encrypted file blobs on the local filesystem (Docker volume).
Backend is cryptographically blind — all content is pre-encrypted by the client.
"""

import aiofiles
from pathlib import Path
from typing import Optional, Tuple
from app.config import get_settings

settings = get_settings()


class LocalStorageService:
    """Read/write encrypted blobs to a local directory."""

    def __init__(self, base_dir: Optional[str] = None):
        self.base_dir = Path(base_dir or settings.STORAGE_DIR)

    def _user_dir(self, user_id: str) -> Path:
        d = self.base_dir / user_id
        d.mkdir(parents=True, exist_ok=True)
        return d

    def _file_path(self, user_id: str, file_id: str) -> Path:
        return self.base_dir / user_id / file_id

    async def save_file(self, user_id: str, file_id: str, content: bytes) -> None:
        self._user_dir(user_id)
        async with aiofiles.open(self._file_path(user_id, file_id), "wb") as f:
            await f.write(content)

    async def read_file(self, user_id: str, file_id: str) -> Tuple[Optional[bytes], Optional[str]]:
        path = self._file_path(user_id, file_id)
        if not path.exists():
            return None, "File not found on disk"
        async with aiofiles.open(path, "rb") as f:
            return await f.read(), None

    async def delete_file(self, user_id: str, file_id: str) -> None:
        path = self._file_path(user_id, file_id)
        if path.exists():
            path.unlink()

    def file_exists(self, user_id: str, file_id: str) -> bool:
        return self._file_path(user_id, file_id).exists()
