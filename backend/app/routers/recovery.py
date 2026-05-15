"""Recovery-key router.

Endpoints:
- POST /auth/recovery/setup        (requires full session) — opt in / rotate
- DELETE /auth/recovery            (requires full session) — disable
- GET  /auth/recovery/status       (requires full session)
- POST /auth/recovery/challenge    (anonymous, by email) — fetch wrapped vault
- POST /auth/recovery/reset        (anonymous, signed)   — set new credentials
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session as DBSession

from app.config import get_settings
from app.database import get_db
from app.models.user import User
from app.routers.auth import get_current_user, _is_cookie_secure, _client_user_agent
from app.schemas import (
    RecoverySetupRequest,
    RecoverySetupResponse,
    RecoveryStatusResponse,
    RecoveryChallengeRequest,
    RecoveryChallengeResponse,
    RecoveryResetRequest,
    RecoveryResetResponse,
)
from app.services.audit import AuditService
from app.services.observability import get_client_ip
from app.services.recovery import RecoveryService


router = APIRouter(prefix="/auth/recovery", tags=["recovery"])
settings = get_settings()


@router.get("/status", response_model=RecoveryStatusResponse)
async def recovery_status(
    current_user: User = Depends(get_current_user),
):
    return RecoveryStatusResponse(recoveryEnabled=bool(current_user.recovery_enabled))


@router.post("/setup", response_model=RecoverySetupResponse)
async def setup_recovery(
    data: RecoverySetupRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    RecoveryService(db).enable_recovery(
        user=current_user,
        recovery_salt=data.recoverySalt,
        recovery_kdf_params=data.recoveryKdfParams.model_dump(),
        encrypted_vault_key_recovery=data.encryptedVaultKeyRecovery.model_dump(),
    )
    AuditService(db).log(
        user_id=current_user.id,
        action="recovery.enabled",
        category="auth",
        resource_type="user",
        resource_id=current_user.id,
    )
    return RecoverySetupResponse(recoveryEnabled=True)


@router.delete("", response_model=RecoverySetupResponse)
async def disable_recovery(
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    RecoveryService(db).disable_recovery(current_user)
    AuditService(db).log(
        user_id=current_user.id,
        action="recovery.disabled",
        category="auth",
        resource_type="user",
        resource_id=current_user.id,
    )
    return RecoverySetupResponse(recoveryEnabled=False)


@router.post("/challenge", response_model=RecoveryChallengeResponse)
async def recovery_challenge(
    payload: RecoveryChallengeRequest,
    db: DBSession = Depends(get_db),
):
    challenge, error = RecoveryService(db).get_recovery_challenge(payload.email)
    if error or not challenge:
        # Use 404 to keep response shape similar regardless of misconfig vs missing.
        raise HTTPException(status_code=404, detail=error or "Recovery unavailable")
    return RecoveryChallengeResponse(**challenge)


@router.post("/reset", response_model=RecoveryResetResponse)
async def recovery_reset(
    payload: RecoveryResetRequest,
    request: Request,
    response: Response,
    db: DBSession = Depends(get_db),
):
    service = RecoveryService(db)
    user, session, error = service.reset_password(
        email=payload.email,
        challenge_id=payload.recoveryChallengeId,
        signature=payload.signature,
        new_salt=payload.newSalt,
        new_kdf_params=payload.newKdfParams.model_dump(),
        new_encrypted_vault_key=payload.newEncryptedVaultKey.model_dump(),
        new_login_proof=payload.newLoginProof,
        new_encrypted_auth_private_key=payload.newEncryptedAuthPrivateKey.model_dump(),
        new_encrypted_private_key=payload.newEncryptedPrivateKey,
        new_recovery_salt=payload.newRecoverySalt,
        new_recovery_kdf_params=payload.newRecoveryKdfParams.model_dump() if payload.newRecoveryKdfParams else None,
        new_encrypted_vault_key_recovery=payload.newEncryptedVaultKeyRecovery.model_dump() if payload.newEncryptedVaultKeyRecovery else None,
        new_encrypted_mfa_secret=payload.newEncryptedMfaSecret.model_dump() if payload.newEncryptedMfaSecret else None,
        ip_address=get_client_ip(request),
        user_agent=_client_user_agent(request),
    )
    if error or not user or not session:
        raise HTTPException(status_code=400, detail=error or "Recovery failed")

    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=session.token,
        max_age=settings.SESSION_TTL_SECONDS,
        httponly=True,
        samesite="lax",
        secure=_is_cookie_secure(),
    )

    AuditService(db).log(
        user_id=user.id,
        action="recovery.password_reset",
        category="auth",
        resource_type="user",
        resource_id=user.id,
    )
    return RecoveryResetResponse(success=True, userId=user.id, email=user.email)
