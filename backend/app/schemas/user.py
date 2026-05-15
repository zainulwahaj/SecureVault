"""
User Schemas for Zero-Knowledge Authentication API

SECURITY:
- Registration accepts encrypted data only (no passwords)
- Login returns encrypted data for client-side decryption
- Backend is cryptographically blind to user secrets
"""

from datetime import datetime
from pydantic import BaseModel, Field, field_validator
from typing import Dict, Any
import re

# Simple email regex pattern
EMAIL_REGEX = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')


# ============================================================================
# KDF and Encryption Types
# ============================================================================

class KdfParams(BaseModel):
    """Key Derivation Function parameters"""
    algorithm: str = Field(..., description="KDF algorithm (e.g., 'pbkdf2-sha256')")
    iterations: int = Field(..., ge=10000, description="Number of iterations")
    keyLength: int = Field(..., ge=16, le=64, description="Output key length in bytes")
    version: int = Field(..., ge=1, description="Parameter version for upgrades")


class EncryptedBlob(BaseModel):
    """Encrypted data blob format"""
    ciphertext: str = Field(..., description="Base64-encoded nonce + ciphertext + tag")
    algorithm: str = Field(..., description="Encryption algorithm")
    version: int = Field(..., ge=1, description="Format version")


# ============================================================================
# Registration Schemas (Zero-Knowledge)
# ============================================================================

class ZKRegisterRequest(BaseModel):
    """
    Zero-Knowledge Registration Request.
    
    SECURITY: No password field - all crypto happens client-side.
    Backend stores only encrypted blobs it cannot decrypt.
    """
    email: str = Field(..., min_length=3, max_length=255)
    salt: str = Field(..., min_length=32, description="Base64-encoded random salt")
    kdfParams: KdfParams
    encryptedVaultKey: EncryptedBlob
    loginProof: str = Field(..., min_length=32, description="SHA-256 hash of VaultKey")
    publicKey: str = Field(..., min_length=32, description="X25519 public key (base64)")
    encryptedPrivateKey: str = Field(..., min_length=32, description="X25519 private key encrypted with VaultKey")
    authPublicKey: str = Field(..., min_length=32, description="Ed25519 auth public key (base64)")
    encryptedAuthPrivateKey: EncryptedBlob = Field(
        ..., description="Ed25519 auth private key encrypted with VaultKey"
    )
    
    @field_validator('email')
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.lower().strip()
        if not EMAIL_REGEX.match(v):
            raise ValueError('Invalid email address')
        return v


# ============================================================================
# Login Schemas (Zero-Knowledge)
# ============================================================================

class ZKLoginChallengeRequest(BaseModel):
    """Request to get login challenge (encrypted data to decrypt)"""
    email: str = Field(..., min_length=3, max_length=255)
    
    @field_validator('email')
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.lower().strip()
        if not EMAIL_REGEX.match(v):
            raise ValueError('Invalid email address')
        return v


class ZKLoginChallengeResponse(BaseModel):
    """
    Login challenge data for client-side decryption.
    
    Client will:
    1. Derive KEK from password + salt using kdfParams
    2. Attempt to decrypt encryptedVaultKey
    3. If successful, generate proof and call verify endpoint
    """
    userId: str
    email: str
    salt: str
    kdfParams: KdfParams
    encryptedVaultKey: EncryptedBlob
    encryptedAuthPrivateKey: EncryptedBlob | None = None
    authChallengeId: str
    authChallenge: str = Field(..., description="Base64-encoded one-time login challenge")
    mfaRequired: bool = False
    authKeyRequired: bool = True


class ZKLoginVerifyRequest(BaseModel):
    """
    Login verification after successful client-side decryption.
    
    The proof demonstrates the client successfully decrypted the VaultKey
    without revealing the actual key to the backend.
    """
    email: str = Field(..., min_length=3, max_length=255)
    challengeId: str | None = Field(None, description="One-time challenge ID from login challenge")
    signature: str | None = Field(None, description="Base64 Ed25519 signature over the challenge")
    proof: str | None = Field(None, min_length=32, description="Legacy SHA-256 hash of decrypted VaultKey")
    
    @field_validator('email')
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.lower().strip()
        if not EMAIL_REGEX.match(v):
            raise ValueError('Invalid email address')
        return v


# ============================================================================
# Response Schemas
# ============================================================================

class UserResponse(BaseModel):
    """User data returned to frontend (safe to expose)"""
    id: str
    email: str
    displayName: str | None = None
    avatarUrl: str | None = None
    createdAt: datetime
    
    class Config:
        from_attributes = True
        
    @classmethod
    def from_orm_model(cls, user):
        """Convert ORM model to response schema"""
        return cls(
            id=user.id,
            email=user.email,
            displayName=user.display_name,
            avatarUrl=user.avatar_url,
            createdAt=user.created_at
        )


class CurrentUserResponse(UserResponse):
    """Current user plus server session assurance level."""
    authLevel: str = "full"
    mfaRequired: bool = False


class UpdateProfileRequest(BaseModel):
    """Update user profile (non-crypto fields)"""
    displayName: str | None = Field(None, max_length=100)
    avatarUrl: str | None = Field(None, max_length=500_000)


class UpdateAuthKeyRequest(BaseModel):
    """Install or rotate challenge-signing auth key material."""
    authPublicKey: str = Field(..., min_length=32, description="Ed25519 auth public key (base64)")
    encryptedAuthPrivateKey: EncryptedBlob = Field(
        ..., description="Ed25519 auth private key encrypted with VaultKey"
    )




class CsrfTokenResponse(BaseModel):
    """CSRF token for cookie-authenticated unsafe requests."""
    csrfToken: str


class SessionDeviceItem(BaseModel):
    """Safe active-session metadata for the security settings UI."""
    sessionIdHash: str
    authLevel: str
    createdAt: datetime | None = None
    lastSeenAt: datetime | None = None
    mfaVerifiedAt: datetime | None = None
    ipAddress: str | None = None
    userAgent: str | None = None
    current: bool = False

    @classmethod
    def from_session(cls, session):
        def parse_dt(value):
            if not value:
                return None
            return datetime.fromisoformat(value)

        return cls(
            sessionIdHash=session.session_id_hash,
            authLevel=session.auth_level,
            createdAt=parse_dt(session.created_at),
            lastSeenAt=parse_dt(session.last_seen_at),
            mfaVerifiedAt=parse_dt(session.mfa_verified_at),
            ipAddress=session.ip_address,
            userAgent=session.user_agent,
            current=session.current,
        )


class SessionListResponse(BaseModel):
    sessions: list[SessionDeviceItem]
    totalCount: int


class RevokeSessionsRequest(BaseModel):
    keepCurrent: bool = True


class RevokeSessionsResponse(BaseModel):
    revokedCount: int


class SessionResponse(BaseModel):
    """Response after successful login/registration"""
    user: UserResponse
    sessionId: str
    authLevel: str = "full"
    mfaRequired: bool = False


class ChangePasswordRequest(BaseModel):
    """
    Change password request (zero-knowledge).

    The client re-derives everything with the new password and sends
    the updated encrypted blobs + proof.  The old proof is checked first.
    """
    oldProof: str = Field(..., min_length=32, description="SHA-256 hash of VaultKey (proves current password)")
    salt: str = Field(..., min_length=32, description="New base64-encoded random salt")
    kdfParams: KdfParams
    encryptedVaultKey: EncryptedBlob
    loginProof: str = Field(..., min_length=32, description="New SHA-256 hash of VaultKey")
    encryptedPrivateKey: str = Field(..., min_length=32, description="Private key re-encrypted with new VaultKey")
