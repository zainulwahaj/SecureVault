"""
Sharing Schemas - Envelope Encryption for File Sharing

SECURITY:
- All encryption happens client-side
- Backend stores only encrypted blobs
- Public keys can be shared openly
- Private keys are encrypted with VaultKey
"""

from datetime import datetime
from pydantic import BaseModel, Field
from typing import Optional, List


# ============================================================================
# Encrypted Blob (reused structure)
# ============================================================================

class EncryptedBlob(BaseModel):
    """Encrypted data blob format"""
    ciphertext: str = Field(..., description="Base64-encoded ciphertext")
    algorithm: str = Field(..., description="Encryption algorithm")
    version: int = Field(..., ge=1, description="Format version")


# ============================================================================
# User Search / Public Key Schemas
# ============================================================================

class UserPublicInfo(BaseModel):
    """Public user info for sharing - no sensitive data"""
    id: str
    email: str
    publicKey: str = Field(..., description="X25519 public key (base64)")
    
    @classmethod
    def from_orm_model(cls, user) -> "UserPublicInfo":
        return cls(
            id=user.id,
            email=user.email,
            publicKey=user.public_key,
        )


class UserSearchResponse(BaseModel):
    """Response from user search"""
    users: List[UserPublicInfo] = Field(default_factory=list)


# ============================================================================
# Share File Schemas
# ============================================================================

class ShareFileRequest(BaseModel):
    """
    Request to share a file with another user.
    
    SECURITY:
    - encryptedFileKeyForRecipient: FileKey encrypted with recipient's public key
    - This is computed client-side using recipient's X25519 public key
    - Backend cannot decrypt this
    """
    recipientId: str = Field(..., description="User ID of recipient")
    encryptedFileKeyForRecipient: EncryptedBlob = Field(
        ..., 
        description="FileKey encrypted with recipient's X25519 public key"
    )


class ShareFileResponse(BaseModel):
    """Response after sharing a file"""
    shareId: str
    fileId: str
    recipientId: str
    recipientEmail: str
    sharedAt: datetime


# ============================================================================
# Shared File List Schemas
# ============================================================================

class SharedFileInfo(BaseModel):
    """
    Info about a shared file.
    
    For files shared WITH me:
    - encryptedFileKeyForMe: FileKey encrypted with my public key (I decrypt with my private key)
    
    For files shared BY me:
    - Shows who I shared with
    """
    shareId: str
    fileId: str
    
    # File metadata (encrypted - recipient decrypts with FileKey)
    encryptedFilename: EncryptedBlob
    encryptedMimeType: Optional[EncryptedBlob] = None
    encryptedSize: int
    
    # Owner info
    ownerId: str
    ownerEmail: str
    
    # Recipient info
    recipientId: str
    recipientEmail: str
    
    # The FileKey encrypted for the recipient
    encryptedFileKeyForRecipient: EncryptedBlob
    
    sharedAt: datetime


class SharedWithMeResponse(BaseModel):
    """List of files shared with the current user"""
    files: List[SharedFileInfo] = Field(default_factory=list)
    totalCount: int


class SharedByMeResponse(BaseModel):
    """List of files the current user has shared"""
    shares: List[SharedFileInfo] = Field(default_factory=list)
    totalCount: int


# ============================================================================
# Unshare Schema
# ============================================================================

class UnshareResponse(BaseModel):
    """Response after unsharing a file"""
    success: bool
    fileId: str
    recipientId: str


# ============================================================================
# Update User Keypair Schema (for registration)
# ============================================================================

class UpdateKeypairRequest(BaseModel):
    """
    Update user's keypair for envelope encryption.
    Called during registration or key rotation.
    
    SECURITY:
    - publicKey: X25519 public key, stored in plaintext (anyone can use it)
    - encryptedPrivateKey: Private key encrypted with VaultKey (only user can decrypt)
    """
    publicKey: str = Field(..., description="X25519 public key (base64)")
    encryptedPrivateKey: EncryptedBlob = Field(
        ..., 
        description="X25519 private key encrypted with VaultKey"
    )
