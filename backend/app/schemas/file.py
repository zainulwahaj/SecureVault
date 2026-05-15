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




class FileUploadSessionCreateRequest(BaseModel):
    """Create a resumable chunked upload session."""
    metadata: FileUploadMetadata
    folderId: Optional[str] = None
    totalParts: int = Field(..., ge=1, le=10000)
    totalSize: int = Field(..., ge=1)
    chunkSize: int = Field(..., ge=1024)
    idempotencyKey: Optional[str] = Field(None, max_length=128)


class FileUploadSessionResponse(BaseModel):
    uploadId: str
    fileId: str
    status: str
    receivedParts: List[int] = Field(default_factory=list)
    totalParts: int
    chunkSize: int


class FileUploadPartResponse(BaseModel):
    uploadId: str
    partNumber: int
    encryptedSize: int
    encryptedSha256: str


class FileUploadCompleteRequest(BaseModel):
    manifest: Optional[Dict[str, Any]] = None


class FileUploadAbortResponse(BaseModel):
    uploadId: str
    aborted: bool


class FileUploadResponse(BaseModel):
    """Response after successful file upload"""
    fileId: str = Field(..., description="Unique file identifier")
    encryptedSize: int = Field(..., description="Size of encrypted file in bytes")
    encryptedSha256: Optional[str] = Field(None, description="SHA-256 of encrypted bytes")
    storageMode: str = Field("single", description="single or chunked encrypted storage")
    createdAt: datetime = Field(..., description="Upload timestamp")


class StorageUsageResponse(BaseModel):
    """Per-user physical storage usage."""
    usedBytes: int
    fileBytes: int
    versionBytes: int
    fileCount: int
    maxStorageBytes: int
    maxFileSizeBytes: int
    maxFileCount: int


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
    encryptedSha256: Optional[str] = Field(None, description="SHA-256 of encrypted bytes")
    storageMode: str = Field("single", description="single or chunked encrypted storage")
    chunkManifest: Optional[Dict[str, Any]] = None
    folderId: Optional[str] = Field(None, description="Parent folder ID")
    deletedAt: Optional[datetime] = Field(None, description="Trash timestamp (null if not trashed)")
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
            encryptedSha256=file.content_sha256,
            storageMode=getattr(file, "storage_mode", "single"),
            chunkManifest=getattr(file, "chunk_manifest", None),
            folderId=file.folder_id,
            deletedAt=file.deleted_at,
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
