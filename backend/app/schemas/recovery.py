"""Recovery-key API schemas."""

from typing import Optional, Dict, Any
from pydantic import BaseModel, Field

from app.schemas.user import EncryptedBlob, KdfParams


class RecoverySetupRequest(BaseModel):
    """Client uploads new recovery material after deriving a fresh KEK from
    a locally-generated recovery key."""
    recoverySalt: str = Field(..., min_length=16, description="Base64 salt for recovery KDF")
    recoveryKdfParams: KdfParams
    encryptedVaultKeyRecovery: EncryptedBlob


class RecoverySetupResponse(BaseModel):
    recoveryEnabled: bool


class RecoveryStatusResponse(BaseModel):
    recoveryEnabled: bool


class RecoveryChallengeRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)


class RecoveryChallengeResponse(BaseModel):
    userId: str
    email: str
    recoverySalt: str
    recoveryKdfParams: Dict[str, Any]
    encryptedVaultKeyRecovery: Dict[str, Any]
    recoveryChallengeId: str
    recoveryChallenge: str


class RecoveryResetRequest(BaseModel):
    """Re-rotate every credential-bearing field after a recovery-key unwrap.

    The signature proves possession of the recovery key (the client unwrapped
    the auth key with the recovered VaultKey and signed the server challenge).
    """
    email: str = Field(..., min_length=3, max_length=255)
    recoveryChallengeId: str
    signature: str = Field(..., description="Ed25519 signature over recoveryChallenge")
    newSalt: str = Field(..., min_length=16)
    newKdfParams: KdfParams
    newEncryptedVaultKey: EncryptedBlob
    newLoginProof: str = Field(..., min_length=32)
    newEncryptedAuthPrivateKey: EncryptedBlob
    newEncryptedPrivateKey: Optional[str] = None
    newEncryptedMfaSecret: Optional[EncryptedBlob] = None
    # Optional fresh recovery material if the user wants to rotate the
    # recovery key in the same flow.
    newRecoverySalt: Optional[str] = None
    newRecoveryKdfParams: Optional[KdfParams] = None
    newEncryptedVaultKeyRecovery: Optional[EncryptedBlob] = None


class RecoveryResetResponse(BaseModel):
    success: bool
    userId: str
    email: str
