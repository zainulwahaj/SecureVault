"""
Local File Storage Service

Stores encrypted file blobs on the local filesystem (Docker volume).
Backend is cryptographically blind — all content is pre-encrypted by the client.
"""

import aiofiles
import uuid
from pathlib import Path
from typing import Optional, Tuple
from app.config import get_settings

settings = get_settings()


class LocalStorageService:
    """Read/write encrypted blobs to a local directory."""

    def __init__(self, base_dir: Optional[str] = None):
        self.base_dir = Path(base_dir or settings.STORAGE_DIR)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _safe_path(self, user_id: str, file_id: str) -> Path:
        if not user_id or "/" in user_id or "\\" in user_id or user_id in {".", ".."}:
            raise ValueError("Invalid user storage path")
        rel_parts = Path(file_id).parts
        if (
            not rel_parts
            or any(part in {"", ".", ".."} for part in rel_parts)
            or Path(file_id).is_absolute()
        ):
            raise ValueError("Invalid file storage path")

        path = self.base_dir / user_id / Path(*rel_parts)
        base = self.base_dir.resolve()
        resolved = path.resolve(strict=False)
        if not resolved.is_relative_to(base):
            raise ValueError("Invalid storage path")
        return path

    def _user_dir(self, user_id: str) -> Path:
        d = self._safe_path(user_id, "__placeholder__").parent
        d.mkdir(parents=True, exist_ok=True)
        return d

    def _file_path(self, user_id: str, file_id: str) -> Path:
        return self._safe_path(user_id, file_id)

    async def save_file(self, user_id: str, file_id: str, content: bytes) -> None:
        path = self._file_path(user_id, file_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
        async with aiofiles.open(temp_path, "wb") as f:
            await f.write(content)
            await f.flush()
        temp_path.replace(path)

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

    async def put_part(self, user_id: str, object_key: str, content: bytes) -> None:
        """Store one immutable object part."""
        await self.save_file(user_id, object_key, content)

    async def get_part(self, user_id: str, object_key: str) -> Tuple[Optional[bytes], Optional[str]]:
        """Read one stored object part."""
        return await self.read_file(user_id, object_key)

    async def delete_object(self, user_id: str, object_key: str) -> None:
        """Delete one stored object/part."""
        await self.delete_file(user_id, object_key)

    async def stream_object(self, user_id: str, object_keys: list[str]) -> bytes:
        """Read and concatenate object parts in manifest order."""
        chunks = []
        for key in object_keys:
            content, error = await self.get_part(user_id, key)
            if error or content is None:
                raise FileNotFoundError(error or "Object part not found")
            chunks.append(content)
        return b"".join(chunks)

    async def finalize_upload(self, user_id: str, object_keys: list[str]) -> bytes:
        """Validate that all parts exist and return their concatenated bytes."""
        return await self.stream_object(user_id, object_keys)
