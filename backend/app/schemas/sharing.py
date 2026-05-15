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

class DeviceKeyInfo(BaseModel):
    """Public device key material used for per-device share envelopes."""
    id: str
    deviceLabel: Optional[str] = None
    encryptionPublicKey: str
    signingPublicKey: Optional[str] = None
    fingerprint: str
    createdAt: datetime

    @classmethod
    def from_orm_model(cls, key) -> "DeviceKeyInfo":
        return cls(
            id=key.id,
            deviceLabel=key.device_label,
            encryptionPublicKey=key.encryption_public_key,
            signingPublicKey=key.signing_public_key,
            fingerprint=key.fingerprint,
            createdAt=key.created_at,
        )


class DeviceKeyCreateRequest(BaseModel):
    deviceLabel: Optional[str] = Field(None, max_length=120)
    encryptionPublicKey: str = Field(..., description="X25519 public key (base64)")
    signingPublicKey: Optional[str] = Field(None, description="Optional signing public key for device attestation")


class DeviceKeyListResponse(BaseModel):
    deviceKeys: List[DeviceKeyInfo] = Field(default_factory=list)
    totalCount: int


class DeviceKeyRevokeResponse(BaseModel):
    success: bool
    deviceKeyId: str


class UserPublicInfo(BaseModel):
    """Public user info for sharing - no sensitive data"""
    id: str
    email: str
    publicKey: str = Field(..., description="X25519 public key (base64)")
    publicKeyId: Optional[str] = None
    publicKeyFingerprint: Optional[str] = None
    deviceKeys: List[DeviceKeyInfo] = Field(default_factory=list)
    
    @classmethod
    def from_orm_model(cls, user) -> "UserPublicInfo":
        return cls(
            id=user.id,
            email=user.email,
            publicKey=user.public_key,
            publicKeyId=getattr(user, "sharing_key_id", None),
            publicKeyFingerprint=getattr(user, "sharing_key_fingerprint", None),
            deviceKeys=[DeviceKeyInfo.from_orm_model(k) for k in getattr(user, "sharing_device_keys", [])],
        )


class UserSearchResponse(BaseModel):
    """Response from user search"""
    users: List[UserPublicInfo] = Field(default_factory=list)


# ============================================================================
# Share File Schemas
# ============================================================================


class DeviceShareEnvelopeRequest(BaseModel):
    recipientDeviceKeyId: str
    recipientDeviceKeyFingerprint: str
    encryptedFileKey: EncryptedBlob

class ShareFileRequest(BaseModel):
    """
    Request to share a file with another user.
    
    SECURITY:
    - encryptedFileKeyForRecipient: FileKey encrypted with recipient's public key
    - This is computed client-side using recipient's X25519 public key
    - Backend cannot decrypt this
    """
    recipientId: str = Field(..., description="User ID of recipient")
    recipientPublicKeyFingerprint: Optional[str] = Field(
        None, description="Fingerprint shown to the sender when encrypting"
    )
    permission: str = Field("read", pattern="^read$", description="Share permission")
    expiresAt: Optional[datetime] = None
    encryptedFileKeyForRecipient: EncryptedBlob = Field(
        ..., 
        description="FileKey encrypted with recipient's X25519 public key"
    )
    deviceEnvelopes: List[DeviceShareEnvelopeRequest] = Field(
        default_factory=list,
        description="Optional per-recipient-device FileKey envelopes"
    )


class ShareFileResponse(BaseModel):
    """Response after sharing a file"""
    shareId: str
    fileId: str
    recipientId: str
    recipientEmail: str
    permission: str
    publicKeyFingerprint: Optional[str] = None
    sharedAt: datetime


# ============================================================================
# Shared File List Schemas
# ============================================================================

class ShareEnvelopeInfo(BaseModel):
    id: str
    recipientDeviceKeyId: Optional[str] = None
    recipientUserKeyId: Optional[str] = None
    encryptedFileKey: EncryptedBlob
    keyVersion: int
    createdAt: datetime

    @classmethod
    def from_orm_model(cls, envelope) -> "ShareEnvelopeInfo":
        return cls(
            id=envelope.id,
            recipientDeviceKeyId=envelope.recipient_device_key_id,
            recipientUserKeyId=envelope.recipient_user_key_id,
            encryptedFileKey=envelope.encrypted_file_key,
            keyVersion=envelope.key_version,
            createdAt=envelope.created_at,
        )


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
    storageMode: str = "single"
    chunkManifest: Optional[dict] = None
    
    # Owner info
    ownerId: str
    ownerEmail: str
    
    # Recipient info
    recipientId: str
    recipientEmail: str
    
    # The FileKey encrypted for the recipient
    encryptedFileKeyForRecipient: EncryptedBlob
    # Present only when the owner lists shares they created.
    encryptedFileKeyForOwner: Optional[EncryptedBlob] = None
    permission: str = "read"
    expiresAt: Optional[datetime] = None
    revokedAt: Optional[datetime] = None
    publicKeyFingerprint: Optional[str] = None
    envelopes: List[ShareEnvelopeInfo] = Field(default_factory=list)
    
    sharedAt: datetime


class SharedWithMeResponse(BaseModel):
    """List of files shared with the current user"""
    files: List[SharedFileInfo] = Field(default_factory=list)
    totalCount: int


class SharedByMeResponse(BaseModel):
    """List of files the current user has shared"""
    shares: List[SharedFileInfo] = Field(default_factory=list)
    totalCount: int


class FileShareInfo(BaseModel):
    """Recipient-level share info for a single owner-owned file."""
    recipientId: str
    recipientEmail: str
    permission: str
    publicKeyFingerprint: Optional[str] = None
    envelopeCount: int = 0
    sharedAt: datetime


class FileSharesResponse(BaseModel):
    """List of active recipients for one file."""
    fileId: str
    shares: List[FileShareInfo] = Field(default_factory=list)


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
    encryptedPrivateKey: str = Field(
        ...,
        min_length=32,
        description="X25519 private key encrypted with VaultKey"
    )


class StrongRevokeResponse(BaseModel):
    success: bool
    fileId: str
    recipientId: str
    keyRotationRequired: bool = True
    message: str


# ============================================================================
# Strong revocation: rotate file content + envelopes
# ============================================================================

class RotateRecipientEnvelope(BaseModel):
    """One recipient's new envelopes for the rotated FileKey."""
    recipientId: str
    recipientPublicKeyFingerprint: str
    encryptedFileKeyForRecipient: EncryptedBlob
    deviceEnvelopes: List[DeviceShareEnvelopeRequest] = Field(default_factory=list)


class RotateFileContentMetadata(BaseModel):
    """Multipart 'metadata' JSON for the rotate-content endpoint."""
    encryptedFileKey: EncryptedBlob = Field(
        ..., description="New FileKey wrapped with the owner's VaultKey"
    )
    encryptedFilename: Optional[EncryptedBlob] = Field(
        None, description="Filename re-encrypted with the new FileKey (if changed)"
    )
    encryptedMimeType: Optional[EncryptedBlob] = Field(
        None, description="MIME type re-encrypted with the new FileKey (if changed)"
    )
    recipientEnvelopes: List[RotateRecipientEnvelope] = Field(
        default_factory=list,
        description="New envelopes for the recipients who should keep access",
    )


class RotateFileContentResponse(BaseModel):
    success: bool
    fileId: str
    rotatedShareIds: List[str] = Field(default_factory=list)
    revokedShareIds: List[str] = Field(default_factory=list)
    revokedLinkIds: List[str] = Field(default_factory=list)
    keyVersion: int
