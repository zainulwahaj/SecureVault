"""WebAuthn / passkey router.

Implements registration + authentication ceremonies as a second factor.
Falls back to a 503 response if the `webauthn` library is not installed.
"""

import base64
import json
import secrets
from datetime import datetime
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session as DBSession

from app.config import get_settings
from app.database import get_db
from app.models.user import User
from app.models.webauthn_credential import WebAuthnCredential
from app.routers.auth import get_current_user, get_current_auth_user, get_session_token
from app.services.audit import AuditService
from app.services.session import SessionService, get_redis


router = APIRouter(prefix="/auth/webauthn", tags=["webauthn"])
settings = get_settings()


WEBAUTHN_REGISTER_PREFIX = "webauthn_reg:"
WEBAUTHN_AUTH_PREFIX = "webauthn_auth:"
WEBAUTHN_CHALLENGE_TTL = 5 * 60


# ---------------------------------------------------------------------------
# Schemas (local — small surface)
# ---------------------------------------------------------------------------

class WebAuthnCredentialInfo(BaseModel):
    id: str
    label: Optional[str] = None
    transports: Optional[List[str]] = None
    aaguid: Optional[str] = None
    createdAt: datetime
    lastUsedAt: Optional[datetime] = None


class WebAuthnListResponse(BaseModel):
    credentials: List[WebAuthnCredentialInfo] = Field(default_factory=list)


class WebAuthnRegisterBeginResponse(BaseModel):
    options: Dict[str, Any]
    challengeId: str


class WebAuthnRegisterCompleteRequest(BaseModel):
    challengeId: str
    label: Optional[str] = Field(None, max_length=120)
    credential: Dict[str, Any]


class WebAuthnAuthBeginRequest(BaseModel):
    email: Optional[str] = None


class WebAuthnAuthBeginResponse(BaseModel):
    options: Dict[str, Any]
    challengeId: str


class WebAuthnAuthCompleteRequest(BaseModel):
    challengeId: str
    credential: Dict[str, Any]


class WebAuthnSimpleResponse(BaseModel):
    success: bool


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_webauthn():
    """Import the `webauthn` package on demand.

    Returns the module or `None` when the dependency is missing. Endpoints
    return 503 in that case so the rest of the app stays usable.
    """
    try:
        import webauthn  # type: ignore
        return webauthn
    except ImportError:
        return None


def _rp_id() -> str:
    # Allow override via settings; default to a sane localhost value.
    return getattr(settings, "WEBAUTHN_RP_ID", "localhost")


def _rp_name() -> str:
    return getattr(settings, "WEBAUTHN_RP_NAME", settings.APP_NAME)


def _origin() -> str:
    return getattr(settings, "WEBAUTHN_ORIGIN", "http://localhost:3000")


def _bytes_to_b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_to_bytes(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def _list_active_credentials(db: DBSession, user: User) -> List[WebAuthnCredential]:
    return db.query(WebAuthnCredential).filter(
        WebAuthnCredential.user_id == user.id,
        WebAuthnCredential.revoked_at.is_(None),
    ).all()


# ---------------------------------------------------------------------------
# Credential listing / revocation
# ---------------------------------------------------------------------------

@router.get("/credentials", response_model=WebAuthnListResponse)
async def list_credentials(
    current_user: User = Depends(get_current_auth_user),
    db: DBSession = Depends(get_db),
):
    rows = _list_active_credentials(db, current_user)
    return WebAuthnListResponse(
        credentials=[
            WebAuthnCredentialInfo(
                id=row.id,
                label=row.label,
                transports=row.transports,
                aaguid=row.aaguid,
                createdAt=row.created_at,
                lastUsedAt=row.last_used_at,
            )
            for row in rows
        ]
    )


@router.delete("/credentials/{credential_id}", response_model=WebAuthnSimpleResponse)
async def revoke_credential(
    credential_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    row = db.query(WebAuthnCredential).filter(
        WebAuthnCredential.id == credential_id,
        WebAuthnCredential.user_id == current_user.id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Credential not found")
    row.revoked_at = datetime.utcnow()
    db.commit()
    AuditService(db).log(
        user_id=current_user.id,
        action="webauthn.credential_revoked",
        category="auth",
        resource_type="user",
        resource_id=current_user.id,
    )
    return WebAuthnSimpleResponse(success=True)


# ---------------------------------------------------------------------------
# Registration ceremony
# ---------------------------------------------------------------------------

@router.post("/register/begin", response_model=WebAuthnRegisterBeginResponse)
async def register_begin(
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    webauthn = _load_webauthn()
    if webauthn is None:
        raise HTTPException(status_code=503, detail="WebAuthn library not installed")

    from webauthn.helpers.structs import (
        AuthenticatorSelectionCriteria,
        ResidentKeyRequirement,
        UserVerificationRequirement,
        PublicKeyCredentialDescriptor,
    )

    existing = [
        PublicKeyCredentialDescriptor(id=_b64url_to_bytes(row.credential_id))
        for row in _list_active_credentials(db, current_user)
    ]
    options = webauthn.generate_registration_options(
        rp_id=_rp_id(),
        rp_name=_rp_name(),
        user_id=current_user.id.encode("utf-8"),
        user_name=current_user.email,
        user_display_name=current_user.display_name or current_user.email,
        exclude_credentials=existing,
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.PREFERRED,
        ),
    )
    challenge_id = secrets.token_urlsafe(24)
    get_redis().setex(
        f"{WEBAUTHN_REGISTER_PREFIX}{challenge_id}",
        WEBAUTHN_CHALLENGE_TTL,
        json.dumps({
            "user_id": current_user.id,
            "challenge": _bytes_to_b64url(options.challenge),
        }),
    )
    options_json = json.loads(webauthn.options_to_json(options))
    return WebAuthnRegisterBeginResponse(options=options_json, challengeId=challenge_id)


@router.post("/register/complete", response_model=WebAuthnSimpleResponse)
async def register_complete(
    payload: WebAuthnRegisterCompleteRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    webauthn = _load_webauthn()
    if webauthn is None:
        raise HTTPException(status_code=503, detail="WebAuthn library not installed")
    from webauthn.helpers import parse_registration_credential_json

    r = get_redis()
    raw = r.get(f"{WEBAUTHN_REGISTER_PREFIX}{payload.challengeId}")
    if not raw:
        raise HTTPException(status_code=400, detail="Registration challenge expired")
    stored = json.loads(raw)
    if stored.get("user_id") != current_user.id:
        raise HTTPException(status_code=400, detail="Challenge does not match user")
    r.delete(f"{WEBAUTHN_REGISTER_PREFIX}{payload.challengeId}")

    try:
        credential = parse_registration_credential_json(json.dumps(payload.credential))
        verification = webauthn.verify_registration_response(
            credential=credential,
            expected_challenge=_b64url_to_bytes(stored["challenge"]),
            expected_origin=_origin(),
            expected_rp_id=_rp_id(),
            require_user_verification=False,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Registration verification failed: {e}")

    transports = payload.credential.get("response", {}).get("transports") if isinstance(payload.credential.get("response"), dict) else None
    db.add(WebAuthnCredential(
        user_id=current_user.id,
        credential_id=_bytes_to_b64url(verification.credential_id),
        public_key=_bytes_to_b64url(verification.credential_public_key),
        sign_count=verification.sign_count,
        transports=transports,
        aaguid=str(getattr(verification, "aaguid", "") or "") or None,
        label=payload.label,
    ))
    db.commit()

    AuditService(db).log(
        user_id=current_user.id,
        action="webauthn.credential_registered",
        category="auth",
        resource_type="user",
        resource_id=current_user.id,
    )
    return WebAuthnSimpleResponse(success=True)


# ---------------------------------------------------------------------------
# Authentication ceremony (used as MFA factor during login)
# ---------------------------------------------------------------------------

@router.post("/auth/begin", response_model=WebAuthnAuthBeginResponse)
async def auth_begin(
    payload: WebAuthnAuthBeginRequest,
    current_user: User = Depends(get_current_auth_user),
    db: DBSession = Depends(get_db),
):
    webauthn = _load_webauthn()
    if webauthn is None:
        raise HTTPException(status_code=503, detail="WebAuthn library not installed")
    from webauthn.helpers.structs import (
        PublicKeyCredentialDescriptor,
        UserVerificationRequirement,
    )

    creds = _list_active_credentials(db, current_user)
    if not creds:
        raise HTTPException(status_code=404, detail="No registered passkeys")

    options = webauthn.generate_authentication_options(
        rp_id=_rp_id(),
        allow_credentials=[
            PublicKeyCredentialDescriptor(id=_b64url_to_bytes(row.credential_id))
            for row in creds
        ],
        user_verification=UserVerificationRequirement.PREFERRED,
    )
    challenge_id = secrets.token_urlsafe(24)
    get_redis().setex(
        f"{WEBAUTHN_AUTH_PREFIX}{challenge_id}",
        WEBAUTHN_CHALLENGE_TTL,
        json.dumps({
            "user_id": current_user.id,
            "challenge": _bytes_to_b64url(options.challenge),
        }),
    )
    options_json = json.loads(webauthn.options_to_json(options))
    return WebAuthnAuthBeginResponse(options=options_json, challengeId=challenge_id)


@router.post("/auth/complete", response_model=WebAuthnSimpleResponse)
async def auth_complete(
    payload: WebAuthnAuthCompleteRequest,
    session_token: Optional[str] = Depends(get_session_token),
    current_user: User = Depends(get_current_auth_user),
    db: DBSession = Depends(get_db),
):
    """Verify a passkey assertion and upgrade the current session to full MFA."""
    webauthn = _load_webauthn()
    if webauthn is None:
        raise HTTPException(status_code=503, detail="WebAuthn library not installed")
    from webauthn.helpers import parse_authentication_credential_json

    r = get_redis()
    raw = r.get(f"{WEBAUTHN_AUTH_PREFIX}{payload.challengeId}")
    if not raw:
        raise HTTPException(status_code=400, detail="Authentication challenge expired")
    stored = json.loads(raw)
    if stored.get("user_id") != current_user.id:
        raise HTTPException(status_code=400, detail="Challenge does not match user")
    r.delete(f"{WEBAUTHN_AUTH_PREFIX}{payload.challengeId}")

    credential = parse_authentication_credential_json(json.dumps(payload.credential))
    credential_b64 = _bytes_to_b64url(credential.raw_id)
    row = db.query(WebAuthnCredential).filter(
        WebAuthnCredential.user_id == current_user.id,
        WebAuthnCredential.credential_id == credential_b64,
        WebAuthnCredential.revoked_at.is_(None),
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Credential not registered")

    try:
        verification = webauthn.verify_authentication_response(
            credential=credential,
            expected_challenge=_b64url_to_bytes(stored["challenge"]),
            expected_origin=_origin(),
            expected_rp_id=_rp_id(),
            credential_public_key=_b64url_to_bytes(row.public_key),
            credential_current_sign_count=row.sign_count,
            require_user_verification=False,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Authentication verification failed: {e}")

    row.sign_count = verification.new_sign_count
    row.last_used_at = datetime.utcnow()
    db.commit()

    # Upgrade the in-flight session to full MFA assurance.
    if session_token:
        SessionService(db).promote_session_to_full(session_token)

    AuditService(db).log(
        user_id=current_user.id,
        action="webauthn.authenticated",
        category="auth",
        resource_type="user",
        resource_id=current_user.id,
    )
    return WebAuthnSimpleResponse(success=True)
