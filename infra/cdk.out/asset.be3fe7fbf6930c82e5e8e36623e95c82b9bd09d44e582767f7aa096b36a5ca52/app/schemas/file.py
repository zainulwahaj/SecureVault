"""
File Schemas for Zero-Knowledge Encrypted File Storage

SECURITY:
- All file content is encrypted client-side
- FileKey encrypted with VaultKey before transmission
- Filename encrypted with FileKey (zero-knowledge filenames)
- Backend stores only opaque encrypted blobs
- Backend cannot decrypt or inspect file contents
"""

from datetime import datetime
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any


# ============================================================================
# Encrypted Blob (reused from auth, but defined here for clarity)
# ============================================================================

class EncryptedBlob(BaseModel):
    """Encrypted data blob format (same as auth schemas)"""
    ciphertext: str = Field(..., description="Base64-encoded nonce + ciphertext + tag")
    algorithm: str = Field(..., description="Encryption algorithm")
    version: int = Field(..., ge=1, description="Format version")


# ============================================================================
# File Upload Schemas
# ============================================================================

class FileUploadMetadata(BaseModel):
    """
    Metadata sent with file upload.
    
    SECURITY:
    - encryptedFileKey: FileKey encrypted with VaultKey (only user can decrypt)
    - encryptedFilename: Original filename encrypted with FileKey
    - encryptedMimeType: MIME type encrypted with FileKey (optional)
    - Backend sees only encrypted blobs
    """
    encryptedFileKey: EncryptedBlob = Field(..., description="FileKey encrypted with VaultKey")
    encryptedFilename: EncryptedBlob = Field(..., description="Original filename encrypted with FileKey")
    encryptedMimeType: Optional[EncryptedBlob] = Field(None, description="MIME type encrypted with FileKey")


class FileUploadResponse(BaseModel):
    """Response after successful file upload"""
    fileId: str = Field(..., description="Unique file identifier")
    encryptedSize: int = Field(..., description="Size of encrypted file in bytes")
    createdAt: datetime = Field(..., description="Upload timestamp")


# ============================================================================
# File List Schemas
# ============================================================================

class FileListItem(BaseModel):
    """
    File metadata returned in list.
    
    Client will decrypt:
    - encryptedFilename → original filename
    - encryptedMimeType → original MIME type
    
    Using FileKey which they decrypt from encryptedFileKey using VaultKey.
    """
    id: str = Field(..., description="Unique file identifier")
    encryptedFileKey: EncryptedBlob = Field(..., description="FileKey encrypted with VaultKey")
    encryptedFilename: EncryptedBlob = Field(..., description="Filename encrypted with FileKey")
    encryptedMimeType: Optional[EncryptedBlob] = Field(None, description="MIME type encrypted")
    encryptedSize: int = Field(..., description="Size of encrypted file in bytes")
    createdAt: datetime = Field(..., description="Upload timestamp")
    updatedAt: datetime = Field(..., description="Last update timestamp")
    
    @classmethod
    def from_orm_model(cls, file) -> "FileListItem":
        """Create FileListItem from ORM File model"""
        return cls(
            id=file.id,
            encryptedFileKey=EncryptedBlob(**file.encrypted_file_key),
            encryptedFilename=EncryptedBlob(**file.encrypted_filename),
            encryptedMimeType=EncryptedBlob(**file.encrypted_mime_type) if file.encrypted_mime_type else None,
            encryptedSize=file.encrypted_size,
            createdAt=file.created_at,
            updatedAt=file.updated_at,
        )


class FileListResponse(BaseModel):
    """Response containing list of user's files"""
    files: List[FileListItem] = Field(default_factory=list, description="List of encrypted file metadata")
    totalCount: int = Field(..., description="Total number of files")


# ============================================================================
# File Delete Schema
# ============================================================================

class FileDeleteResponse(BaseModel):
    """Response after file deletion"""
    success: bool = Field(..., description="Whether deletion succeeded")
    fileId: str = Field(..., description="ID of deleted file")
