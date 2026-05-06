"""
MFA Schemas - Zero-Knowledge TOTP Authentication

SECURITY ARCHITECTURE:
- MFA secret is generated client-side
- Secret is encrypted with VaultKey before sending to backend
- Backend stores only the encrypted blob (cannot see secret)
- TOTP codes are generated and verified client-side
- Backend only stores proof that MFA was verified

Recovery codes:
- Generated client-side
- Shown to user once during setup
- Only hashes stored on backend
- User can recover account if TOTP device lost
"""

from datetime import datetime
from pydantic import BaseModel, Field
from typing import List, Optional
from app.schemas.file import EncryptedBlob


class MFASetupRequest(BaseModel):
    """
    Request to set up MFA.
    
    Client generates TOTP secret, encrypts with VaultKey,
    and sends the encrypted blob along with hashed recovery codes.
    
    SECURITY:
    - encryptedMfaSecret: TOTP secret encrypted with VaultKey
    - recoveryCodesHash: SHA-256 hashes of recovery codes
    - verificationCode: Current TOTP code to prove setup worked
    """
    encryptedMfaSecret: EncryptedBlob
    serverMfaSecret: str = Field(..., min_length=16, max_length=128)
    recoveryCodesHash: List[str] = Field(..., min_length=8, max_length=12)
    verificationCode: str = Field(..., min_length=6, max_length=6)


class MFASetupResponse(BaseModel):
    """Response after MFA setup"""
    success: bool
    message: str
    mfaEnabled: bool


class MFAStatusResponse(BaseModel):
    """Current MFA status for user"""
    mfaEnabled: bool
    encryptedMfaSecret: Optional[EncryptedBlob] = None
    recoveryCodesRemaining: int = 0


class MFAVerifyRequest(BaseModel):
    """
    Request to verify MFA during login.
    
    After password verification succeeds, if MFA is enabled,
    client must provide either:
    - TOTP code (generated from decrypted secret)
    - Recovery code (one-time use)
    """
    code: str = Field(..., min_length=6, max_length=20)
    isRecoveryCode: bool = False


class MFAVerifyResponse(BaseModel):
    """Response after MFA verification"""
    verified: bool = True
    success: bool
    message: str
    recoveryCodesRemaining: Optional[int] = None


class MFADisableRequest(BaseModel):
    """
    Request to disable MFA.
    
    Requires current TOTP code to confirm user has access.
    """
    verificationCode: str = Field(..., min_length=6, max_length=6)


class MFADisableResponse(BaseModel):
    """Response after disabling MFA"""
    success: bool
    message: str


class RecoveryCodeVerifyRequest(BaseModel):
    """Request to verify a recovery code"""
    recoveryCode: str = Field(..., min_length=10, max_length=20)


class MFALoginChallengeResponse(BaseModel):
    """
    Extended login challenge when MFA is enabled.
    
    Includes encrypted MFA secret so client can:
    1. Decrypt secret with VaultKey
    2. Generate TOTP code
    3. Submit for verification
    """
    mfaRequired: bool
    encryptedMfaSecret: Optional[EncryptedBlob] = None
