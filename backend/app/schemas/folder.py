"""Folder Schemas — Encrypted folder metadata"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
from app.schemas.file import EncryptedBlob


class FolderCreateRequest(BaseModel):
    """Request to create a folder."""
    encryptedName: EncryptedBlob = Field(..., description="Folder name encrypted with VaultKey")
    parentId: Optional[str] = Field(None, description="Parent folder ID (null = root)")


class FolderRenameRequest(BaseModel):
    """Request to rename a folder."""
    encryptedName: EncryptedBlob


class FolderMoveRequest(BaseModel):
    """Request to move a folder to a new parent."""
    parentId: Optional[str] = Field(None, description="New parent folder ID (null = root)")


class FolderResponse(BaseModel):
    """Response for a single folder."""
    id: str
    parentId: Optional[str] = None
    encryptedName: dict
    createdAt: datetime
    updatedAt: datetime

    @classmethod
    def from_orm_model(cls, folder) -> "FolderResponse":
        return cls(
            id=folder.id,
            parentId=folder.parent_id,
            encryptedName=folder.encrypted_name,
            createdAt=folder.created_at,
            updatedAt=folder.updated_at,
        )


class FolderListResponse(BaseModel):
    """Response containing a list of folders."""
    folders: List[FolderResponse] = Field(default_factory=list)
    totalCount: int
