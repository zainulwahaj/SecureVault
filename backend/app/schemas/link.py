"""Link Schemas — Shared link requests / responses"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
from app.schemas.file import EncryptedBlob


class CreateLinkRequest(BaseModel):
    """Request to create a shared link."""
    encryptedFileKey: EncryptedBlob = Field(
        ..., description="FileKey encrypted with the link key"
    )
    encryptedFilename: EncryptedBlob = Field(
        ..., description="Filename encrypted with the link key"
    )
    password: Optional[str] = Field(None, min_length=1, max_length=128)
    expiresAt: Optional[datetime] = None
    maxDownloads: Optional[int] = Field(None, ge=1)


class LinkResponse(BaseModel):
    """Full link info returned to the owner."""
    id: str
    token: str
    fileId: str
    passwordProtected: bool
    expiresAt: Optional[datetime] = None
    maxDownloads: Optional[int] = None
    downloadCount: int
    isActive: bool
    createdAt: datetime

    @classmethod
    def from_orm_model(cls, link) -> "LinkResponse":
        return cls(
            id=link.id,
            token=link.token,
            fileId=link.file_id,
            passwordProtected=link.password_hash is not None,
            expiresAt=link.expires_at,
            maxDownloads=link.max_downloads,
            downloadCount=link.download_count,
            isActive=link.is_active,
            createdAt=link.created_at,
        )


class LinkListResponse(BaseModel):
    """List of links for a file."""
    links: List[LinkResponse] = Field(default_factory=list)
    totalCount: int


class LinkPublicInfo(BaseModel):
    """Non-sensitive info returned to anyone with the token."""
    token: str
    encryptedFilename: dict
    encryptedFileKey: dict
    passwordRequired: bool
    expiresAt: Optional[datetime] = None
    maxDownloads: Optional[int] = None
    downloadCount: int


class VerifyLinkPasswordRequest(BaseModel):
    """Request to check a link password."""
    password: str = Field(..., min_length=1, max_length=128)


class VerifyLinkPasswordResponse(BaseModel):
    """Password verification result."""
    valid: bool
