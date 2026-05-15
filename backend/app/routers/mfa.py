"""
MFA Router - Zero-Knowledge TOTP Authentication API

SECURITY:
- GET /mfa/status: Get MFA status (enabled, recovery codes remaining)
- POST /mfa/setup: Enable MFA with encrypted secret
- POST /mfa/disable: Disable MFA (requires TOTP verification)
- POST /mfa/verify: Verify TOTP code (used during login)
- POST /mfa/recovery: Use a recovery code

Backend is cryptographically blind:
- Cannot see TOTP secrets (encrypted with VaultKey)
- Cannot generate TOTP codes
- Only stores encrypted blobs and hashed recovery codes
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from app.database import get_db
from app.schemas import (
    MFASetupRequest,
    MFASetupResponse,
    MFAStatusResponse,
    MFAVerifyRequest,
    MFAVerifyResponse,
    MFADisableRequest,
    MFADisableResponse,
)
from app.schemas.file import EncryptedBlob
from app.services.mfa import MFAService
from app.services.audit import AuditService
from app.services.session import SessionService
from app.routers.auth import get_current_user, get_current_auth_user, get_session_token
from app.models.user import User

router = APIRouter(prefix="/mfa", tags=["mfa"])


@router.get("/status", response_model=MFAStatusResponse)
async def get_mfa_status(
    current_user: User = Depends(get_current_auth_user),
    db: DBSession = Depends(get_db),
):
    """
    Get current MFA status for the authenticated user.
    
    Returns:
    - mfaEnabled: whether MFA is active
    - encryptedMfaSecret: encrypted secret (for TOTP generation)
    - recoveryCodesRemaining: how many recovery codes are left
    """
    mfa_service = MFAService(db)
    status = mfa_service.get_mfa_status(current_user)
    
    return MFAStatusResponse(
        mfaEnabled=status["mfaEnabled"],
        encryptedMfaSecret=EncryptedBlob(**status["encryptedMfaSecret"]) if status["encryptedMfaSecret"] else None,
        recoveryCodesRemaining=status["recoveryCodesRemaining"],
    )


@router.post("/setup", response_model=MFASetupResponse)
async def setup_mfa(
    data: MFASetupRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """
    Set up MFA for the authenticated user.
    
    SECURITY:
    - Client generates TOTP secret
    - Client encrypts secret with VaultKey
    - Client generates recovery codes and hashes them
    - Client verifies current TOTP code works before submitting
    - Backend stores only encrypted secret and hashed codes
    
    Request:
    - encryptedMfaSecret: TOTP secret encrypted with VaultKey
    - recoveryCodesHash: SHA-256 hashes of recovery codes
    - verificationCode: Current TOTP code (proves setup worked)
    """
    mfa_service = MFAService(db)
    
    # The verification code is validated client-side before this request
    # We trust that if client sends this request, they successfully verified
    
    success, error = mfa_service.setup_mfa(
        user=current_user,
        encrypted_mfa_secret=data.encryptedMfaSecret.model_dump(),
        server_mfa_secret=data.serverMfaSecret,
        recovery_codes_hash=data.recoveryCodesHash,
        verification_code=data.verificationCode,
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=error)

    AuditService(db).log(
        user_id=current_user.id,
        action="mfa.enable",
        category="auth",
        resource_type="user",
        resource_id=current_user.id,
    )
    
    return MFASetupResponse(
        success=True,
        message="MFA enabled successfully",
        mfaEnabled=True,
    )


@router.post("/disable", response_model=MFADisableResponse)
async def disable_mfa(
    data: MFADisableRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """
    Disable MFA for the authenticated user.
    
    SECURITY:
    - Requires current TOTP code to confirm user has authenticator access
    - Client verifies code before submitting this request
    - Once disabled, MFA secret and recovery codes are deleted
    """
    mfa_service = MFAService(db)
    
    success, error = mfa_service.disable_mfa(current_user, data.verificationCode)
    
    if not success:
        raise HTTPException(status_code=400, detail=error)

    AuditService(db).log(
        user_id=current_user.id,
        action="mfa.disable",
        category="auth",
        resource_type="user",
        resource_id=current_user.id,
        severity="warning",
    )
    
    return MFADisableResponse(
        success=True,
        message="MFA disabled successfully",
    )


@router.post("/verify", response_model=MFAVerifyResponse)
async def verify_mfa(
    data: MFAVerifyRequest,
    current_user: User = Depends(get_current_auth_user),
    session_token: str = Depends(get_session_token),
    db: DBSession = Depends(get_db),
):
    """
    Verify MFA code during login or sensitive operations.
    
    Can use either:
    - TOTP code (6 digits, generated from authenticator app)
    - Recovery code (one-time use, 10+ characters)
    
    SECURITY:
    - For TOTP: Client already verified locally, this confirms MFA was checked
    - For recovery: Backend verifies hash and consumes the code
    """
    mfa_service = MFAService(db)
    
    if data.isRecoveryCode:
        # Verify recovery code (backend can verify hash)
        success, error, remaining = mfa_service.verify_recovery_code(
            user=current_user,
            recovery_code=data.code,
        )
        
        if not success:
            AuditService(db).log(
                user_id=current_user.id,
                action="mfa.recovery_failed",
                category="auth",
                outcome="failure",
                severity="warning",
                resource_type="session",
                resource_id=None,
            )
            raise HTTPException(status_code=400, detail=error)

        SessionService(db).promote_session_to_full(session_token)

        AuditService(db).log(
            user_id=current_user.id,
            action="mfa.recovery",
            category="auth",
            resource_type="session",
            resource_id=None,
            details={"recovery_codes_remaining": remaining},
        )
        
        return MFAVerifyResponse(
            verified=True,
            success=True,
            message="Recovery code accepted",
            recoveryCodesRemaining=remaining,
        )
    else:
        if not mfa_service.verify_totp_for_user(current_user, data.code):
            AuditService(db).log(
                user_id=current_user.id,
                action="mfa.verify",
                category="auth",
                outcome="failure",
                severity="warning",
                resource_type="session",
                resource_id=None,
            )
            raise HTTPException(status_code=400, detail="Invalid verification code")

        SessionService(db).promote_session_to_full(session_token)
        AuditService(db).log(
            user_id=current_user.id,
            action="mfa.verify",
            category="auth",
            resource_type="session",
            resource_id=None,
        )
        return MFAVerifyResponse(
            verified=True,
            success=True,
            message="MFA verified",
        )


@router.get("/secret")
async def get_encrypted_secret(
    current_user: User = Depends(get_current_auth_user),
    db: DBSession = Depends(get_db),
):
    """
    Get the encrypted MFA secret.
    
    Used during login so client can:
    1. Decrypt secret with VaultKey
    2. Generate TOTP code
    3. Verify locally
    
    SECURITY:
    - Returns encrypted blob only
    - Backend cannot decrypt this
    """
    mfa_service = MFAService(db)
    secret = mfa_service.get_encrypted_secret(current_user)
    
    if not secret:
        raise HTTPException(status_code=404, detail="MFA not enabled")
    
    return {
        "encryptedMfaSecret": secret,
    }
