"""
Authentication Router - Zero-Knowledge Implementation

SECURITY:
- POST /register: Accepts encrypted data only (no password)
- POST /login/challenge: Returns encrypted data for client decryption
- POST /login/verify: Verifies decryption proof, creates session
- Backend is cryptographically blind to user passwords
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Response, Cookie
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
)
from app.services.auth import AuthService
from app.services.session import SessionService

router = APIRouter(prefix="/auth", tags=["authentication"])
settings = get_settings()


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
    """Set the session cookie on the response"""
    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=session_token,
        httponly=True,  # Prevent JavaScript access
        secure=False,   # Set to True in production with HTTPS
        samesite="lax",
        max_age=settings.SESSION_EXPIRE_HOURS * 3600,
    )


def clear_session_cookie(response: Response) -> None:
    """Clear the session cookie"""
    response.delete_cookie(
        key=settings.SESSION_COOKIE_NAME,
        httponly=True,
        secure=False,
        samesite="lax",
    )


@router.post("/register", response_model=SessionResponse)
async def register(
    data: ZKRegisterRequest,
    response: Response,
    db: DBSession = Depends(get_db)
):
    """
    Register a new user with zero-knowledge authentication.
    
    SECURITY:
    - No password in request (all crypto done client-side)
    - Backend stores only encrypted data it cannot decrypt
    - loginProof allows future verification without password
    - publicKey stored plaintext for envelope encryption
    - encryptedPrivateKey encrypted with VaultKey (backend cannot decrypt)
    """
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
    )
    
    if error:
        raise HTTPException(status_code=400, detail=error)
    
    # Set session cookie
    set_session_cookie(response, session.token)
    
    return SessionResponse(
        user=UserResponse.from_orm_model(user),
        sessionId=session.id,
        authLevel=session.auth_level,
        mfaRequired=False,
    )


@router.post("/login/challenge", response_model=ZKLoginChallengeResponse)
async def login_challenge(
    data: ZKLoginChallengeRequest,
    db: DBSession = Depends(get_db)
):
    """
    Get login challenge data for client-side decryption.
    
    The client will:
    1. Receive salt, KDF params, and encrypted VaultKey
    2. Derive KEK from password + salt
    3. Attempt to decrypt VaultKey
    4. If successful, call /login/verify with proof
    
    SECURITY: No password sent to server.
    """
    auth_service = AuthService(db)
    
    challenge, error = auth_service.get_login_challenge(data.email)
    
    if error:
        # SECURITY: Generic error prevents email enumeration
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    return ZKLoginChallengeResponse(**challenge)


@router.post("/login/verify", response_model=SessionResponse)
async def login_verify(
    data: ZKLoginVerifyRequest,
    response: Response,
    db: DBSession = Depends(get_db)
):
    """
    Verify login by checking decryption proof.
    
    SECURITY:
    - Client proves it knows password by providing hash of decrypted VaultKey
    - Backend compares against stored login_proof
    - Password never transmitted or stored
    """
    auth_service = AuthService(db)
    
    user, session, error = auth_service.verify_login(
        email=data.email,
        challenge_id=data.challengeId,
        signature=data.signature,
        proof=data.proof,
    )
    
    if error:
        raise HTTPException(status_code=401, detail=error)
    
    # Set session cookie
    set_session_cookie(response, session.token)
    
    return SessionResponse(
        user=UserResponse.from_orm_model(user),
        sessionId=session.id,
        authLevel=session.auth_level,
        mfaRequired=session.auth_level == "pending_mfa",
    )


@router.post("/logout")
async def logout(
    response: Response,
    session_token: Optional[str] = Depends(get_session_token),
    db: DBSession = Depends(get_db)
):
    """
    Logout user by destroying their session.
    
    SECURITY: Client must also clear VaultKey from memory.
    """
    if session_token:
        auth_service = AuthService(db)
        auth_service.logout(session_token)
    
    clear_session_cookie(response)
    
    return {"message": "Logged out successfully"}


@router.post("/change-password")
async def change_password(
    data: ChangePasswordRequest,
    current_user = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """
    Change password (zero-knowledge).

    The client proves knowledge of the current password via oldProof,
    then provides new encrypted blobs derived from the new password.
    The VaultKey itself doesn't change — only its encryption wrapper does.
    """
    import secrets

    if not secrets.compare_digest(current_user.login_proof, data.oldProof):
        raise HTTPException(status_code=403, detail="Current password is incorrect")

    current_user.salt = data.salt
    current_user.kdf_params = data.kdfParams.model_dump()
    current_user.encrypted_vault_key = data.encryptedVaultKey.model_dump()
    current_user.login_proof = data.loginProof
    current_user.encrypted_private_key = data.encryptedPrivateKey
    db.commit()

    from app.services.audit import AuditService
    AuditService(db).log(
        user_id=current_user.id,
        action="password_change",
        resource_type="user",
        resource_id=current_user.id,
    )

    return {"success": True, "message": "Password changed successfully"}


@router.get("/me", response_model=CurrentUserResponse)
async def get_current_user_info(
    current_user = Depends(get_current_auth_user),
    current_session = Depends(get_current_session),
):
    """
    Get the currently authenticated user's information.
    
    Used by the frontend to check if a valid session exists.
    """
    user = UserResponse.from_orm_model(current_user)
    return CurrentUserResponse(
        **user.model_dump(),
        authLevel=current_session.auth_level,
        mfaRequired=current_session.auth_level == "pending_mfa",
    )


@router.post("/upgrade-auth-key")
async def upgrade_auth_key(
    data: UpdateAuthKeyRequest,
    current_user = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """Install challenge-signing auth key material after a legacy login."""
    current_user.auth_public_key = data.authPublicKey
    current_user.encrypted_auth_private_key = data.encryptedAuthPrivateKey.model_dump()
    current_user.auth_key_version = "ed25519-v1"
    db.commit()
    return {"success": True}


@router.patch("/profile", response_model=UserResponse)
async def update_profile(
    data: UpdateProfileRequest,
    current_user = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """Update non-crypto profile fields (display name, avatar)."""
    if data.displayName is not None:
        current_user.display_name = data.displayName
    if data.avatarUrl is not None:
        current_user.avatar_url = data.avatarUrl
    db.commit()
    db.refresh(current_user)
    return UserResponse.from_orm_model(current_user)
