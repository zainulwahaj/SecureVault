"""
Authentication Router - Zero-Knowledge Implementation

SECURITY:
- POST /register: Accepts encrypted data only (no password)
- POST /login/challenge: Returns encrypted data for client decryption
- POST /login/verify: Verifies challenge signature, creates session
- Backend is cryptographically blind to user passwords
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Response, Cookie, Request
from sqlalchemy.orm import Session as DBSession
from app.database import get_db
from app.config import get_settings
from app.schemas import (
    ZKRegisterRequest,
    ZKLoginChallengeRequest,
    ZKLoginChallengeResponse,
    ZKLoginVerifyRequest,
    UserResponse,
    CurrentUserResponse,
    SessionResponse,
    ChangePasswordRequest,
    UpdateProfileRequest,
    UpdateAuthKeyRequest,
    CsrfTokenResponse,
    SessionDeviceItem,
    SessionListResponse,
    RevokeSessionsRequest,
    RevokeSessionsResponse,
)
from app.services.auth import AuthService
from app.services.audit import AuditService
from app.services.observability import get_client_ip, hash_session_token
from app.services.session import SessionService, get_redis

router = APIRouter(prefix="/auth", tags=["authentication"])
settings = get_settings()

LOGIN_RATE_PREFIX = "login_rate:"


def _is_cookie_secure() -> bool:
    return settings.SESSION_COOKIE_SECURE or settings.ENVIRONMENT.lower() == "production"


def _client_user_agent(request: Request) -> str | None:
    value = request.headers.get("user-agent")
    return value[:512] if value else None


def _rate_limit_key(kind: str, value: str) -> str:
    return f"{LOGIN_RATE_PREFIX}{kind}:{value}"


def _check_login_rate_limit(email: str, request: Request) -> None:
    r = get_redis()
    window = settings.LOGIN_RATE_LIMIT_WINDOW_SECONDS
    normalized_email = email.lower().strip()
    ip = get_client_ip(request)

    email_key = _rate_limit_key("email", normalized_email)
    ip_key = _rate_limit_key("ip", ip)
    email_attempts = r.incr(email_key)
    ip_attempts = r.incr(ip_key)
    if email_attempts == 1:
        r.expire(email_key, window)
    if ip_attempts == 1:
        r.expire(ip_key, window)
    if (
        email_attempts > settings.LOGIN_RATE_LIMIT_EMAIL_ATTEMPTS
        or ip_attempts > settings.LOGIN_RATE_LIMIT_IP_ATTEMPTS
    ):
        raise HTTPException(status_code=429, detail="Too many login attempts")


def _reset_login_rate_limit(email: str, request: Request) -> None:
    r = get_redis()
    r.delete(_rate_limit_key("email", email.lower().strip()))
    r.delete(_rate_limit_key("ip", get_client_ip(request)))


def get_session_token(
    vault_session: Optional[str] = Cookie(None, alias=settings.SESSION_COOKIE_NAME)
) -> Optional[str]:
    """Extract session token from cookie"""
    return vault_session


def get_current_user(
    session_token: Optional[str] = Depends(get_session_token),
    db: DBSession = Depends(get_db)
):
    """
    Dependency to get the current fully authenticated user.

    Raises 401 if not authenticated and 403 if MFA is still pending.
    """
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    session_service = SessionService(db)
    user, session = session_service.get_user_and_session_from_token(session_token)

    if not user or not session:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    if session.auth_level != "full":
        raise HTTPException(status_code=403, detail="MFA verification required")

    return user


def get_current_auth_user(
    session_token: Optional[str] = Depends(get_session_token),
    db: DBSession = Depends(get_db)
):
    """Get the current user for pending/full auth endpoints such as MFA."""
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    session_service = SessionService(db)
    user, session = session_service.get_user_and_session_from_token(session_token)
    if not user or not session:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    return user


def get_current_session(
    session_token: Optional[str] = Depends(get_session_token),
    db: DBSession = Depends(get_db),
):
    """Return the current Redis session object."""
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    session_service = SessionService(db)
    session = session_service.get_session_from_token(session_token)
    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return session


def set_session_cookie(response: Response, session_token: str) -> None:
    """Set the session cookie on the response."""
    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=session_token,
        httponly=True,
        secure=_is_cookie_secure(),
        samesite="lax",
        max_age=settings.SESSION_EXPIRE_HOURS * 3600,
    )


def clear_session_cookie(response: Response) -> None:
    """Clear the session cookie."""
    response.delete_cookie(
        key=settings.SESSION_COOKIE_NAME,
        httponly=True,
        secure=_is_cookie_secure(),
        samesite="lax",
    )


@router.post("/register", response_model=SessionResponse)
async def register(
    data: ZKRegisterRequest,
    response: Response,
    request: Request,
    db: DBSession = Depends(get_db),
):
    """Register a new user with zero-knowledge authentication."""
    auth_service = AuthService(db)

    user, session, error = auth_service.register(
        email=data.email,
        salt=data.salt,
        kdf_params=data.kdfParams.model_dump(),
        encrypted_vault_key=data.encryptedVaultKey.model_dump(),
        login_proof=data.loginProof,
        public_key=data.publicKey,
        encrypted_private_key=data.encryptedPrivateKey,
        auth_public_key=data.authPublicKey,
        encrypted_auth_private_key=data.encryptedAuthPrivateKey.model_dump(),
        ip_address=get_client_ip(request),
        user_agent=_client_user_agent(request),
    )

    if error:
        raise HTTPException(status_code=400, detail=error)

    set_session_cookie(response, session.token)

    AuditService(db).log(
        user_id=user.id,
        action="auth.register",
        category="auth",
        resource_type="user",
        resource_id=user.id,
        session_id_hash=hash_session_token(session.token),
    )

    return SessionResponse(
        user=UserResponse.from_orm_model(user),
        sessionId=session.id,
        authLevel=session.auth_level,
        mfaRequired=False,
    )


@router.post("/login/challenge", response_model=ZKLoginChallengeResponse)
async def login_challenge(
    data: ZKLoginChallengeRequest,
    request: Request,
    db: DBSession = Depends(get_db),
):
    """Get login challenge data for client-side decryption."""
    _check_login_rate_limit(data.email, request)
    auth_service = AuthService(db)

    challenge, error = auth_service.get_login_challenge(data.email)

    if error:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return ZKLoginChallengeResponse(**challenge)


@router.post("/login/verify", response_model=SessionResponse)
async def login_verify(
    data: ZKLoginVerifyRequest,
    response: Response,
    request: Request,
    db: DBSession = Depends(get_db),
):
    """Verify login with a challenge-bound signature or legacy migration proof."""
    _check_login_rate_limit(data.email, request)
    auth_service = AuthService(db)

    user, session, error = auth_service.verify_login(
        email=data.email,
        challenge_id=data.challengeId,
        signature=data.signature,
        proof=data.proof,
        ip_address=get_client_ip(request),
        user_agent=_client_user_agent(request),
    )

    if error:
        raise HTTPException(status_code=401, detail=error)

    _reset_login_rate_limit(data.email, request)
    set_session_cookie(response, session.token)

    AuditService(db).log(
        user_id=user.id,
        action="auth.login",
        category="auth",
        resource_type="session",
        resource_id=None,
        details={"auth_level": session.auth_level},
        session_id_hash=hash_session_token(session.token),
    )

    return SessionResponse(
        user=UserResponse.from_orm_model(user),
        sessionId=session.id,
        authLevel=session.auth_level,
        mfaRequired=session.auth_level == "pending_mfa",
    )


@router.get("/csrf", response_model=CsrfTokenResponse)
async def get_csrf_token(
    session_token: Optional[str] = Depends(get_session_token),
    db: DBSession = Depends(get_db),
):
    """Return the CSRF token bound to the current Redis session."""
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = SessionService(db).get_or_create_csrf_token(session_token)
    if not token:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return CsrfTokenResponse(csrfToken=token)


@router.post("/logout")
async def logout(
    response: Response,
    session_token: Optional[str] = Depends(get_session_token),
    db: DBSession = Depends(get_db),
):
    """Logout user by destroying their session."""
    user = None
    if session_token:
        user, _ = SessionService(db).get_user_and_session_from_token(session_token)
        auth_service = AuthService(db)
        auth_service.logout(session_token)
        if user:
            AuditService(db).log(
                user_id=user.id,
                action="auth.logout",
                category="auth",
                resource_type="session",
                resource_id=None,
            )

    clear_session_cookie(response)

    return {"message": "Logged out successfully"}


@router.get("/sessions", response_model=SessionListResponse)
async def list_sessions(
    current_user=Depends(get_current_user),
    session_token: str = Depends(get_session_token),
    db: DBSession = Depends(get_db),
):
    """List active sessions/devices for the current account."""
    sessions = SessionService(db).list_user_sessions(current_user.id, current_token=session_token)
    return SessionListResponse(
        sessions=[SessionDeviceItem.from_session(session) for session in sessions],
        totalCount=len(sessions),
    )


@router.post("/sessions/revoke-all", response_model=RevokeSessionsResponse)
async def revoke_all_sessions(
    data: RevokeSessionsRequest,
    current_user=Depends(get_current_user),
    session_token: str = Depends(get_session_token),
    db: DBSession = Depends(get_db),
):
    """Revoke all active sessions, optionally preserving the current device."""
    revoked = SessionService(db).delete_all_user_sessions(
        current_user.id,
        keep_token=session_token if data.keepCurrent else None,
    )
    AuditService(db).log(
        user_id=current_user.id,
        action="auth.sessions_revoke",
        category="auth",
        resource_type="session",
        details={"revoked_count": revoked, "kept_current": data.keepCurrent},
        severity="warning",
    )
    return RevokeSessionsResponse(revokedCount=revoked)


@router.post("/change-password")
async def change_password(
    data: ChangePasswordRequest,
    current_user=Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """Change password by rewrapping zero-knowledge encrypted account blobs."""
    import secrets

    if not secrets.compare_digest(current_user.login_proof, data.oldProof):
        raise HTTPException(status_code=403, detail="Current password is incorrect")

    current_user.salt = data.salt
    current_user.kdf_params = data.kdfParams.model_dump()
    current_user.encrypted_vault_key = data.encryptedVaultKey.model_dump()
    current_user.login_proof = data.loginProof
    current_user.encrypted_private_key = data.encryptedPrivateKey
    db.commit()

    AuditService(db).log(
        user_id=current_user.id,
        action="auth.password_change",
        category="auth",
        resource_type="user",
        resource_id=current_user.id,
    )

    return {"success": True, "message": "Password changed successfully"}


@router.get("/me", response_model=CurrentUserResponse)
async def get_current_user_info(
    current_user=Depends(get_current_auth_user),
    current_session=Depends(get_current_session),
):
    """Get the currently authenticated user's information."""
    user = UserResponse.from_orm_model(current_user)
    return CurrentUserResponse(
        **user.model_dump(),
        authLevel=current_session.auth_level,
        mfaRequired=current_session.auth_level == "pending_mfa",
    )


@router.post("/upgrade-auth-key")
async def upgrade_auth_key(
    data: UpdateAuthKeyRequest,
    current_user=Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """Install challenge-signing auth key material after a legacy login."""
    current_user.auth_public_key = data.authPublicKey
    current_user.encrypted_auth_private_key = data.encryptedAuthPrivateKey.model_dump()
    current_user.auth_key_version = "ed25519-v1"
    db.commit()
    AuditService(db).log(
        user_id=current_user.id,
        action="auth.key_upgrade",
        category="auth",
        resource_type="user",
        resource_id=current_user.id,
    )
    return {"success": True}


@router.patch("/profile", response_model=UserResponse)
async def update_profile(
    data: UpdateProfileRequest,
    current_user=Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """Update non-crypto profile fields (display name, avatar)."""
    if data.displayName is not None:
        current_user.display_name = data.displayName
    if data.avatarUrl is not None:
        current_user.avatar_url = data.avatarUrl
    db.commit()
    db.refresh(current_user)
    AuditService(db).log(
        user_id=current_user.id,
        action="user.profile_update",
        category="account",
        resource_type="user",
        resource_id=current_user.id,
    )
    return UserResponse.from_orm_model(current_user)
