"""
Session Management Service — Redis-backed

Sessions are stored in Redis with automatic TTL expiry.
Session tokens authorize API requests but do NOT grant access
to encryption keys — all cryptographic operations happen client-side.
"""

import json
import secrets
from datetime import datetime, timezone
from typing import Any, Optional
from redis import Redis
from sqlalchemy.orm import Session as DBSession
from app.models.user import User
from app.config import get_settings
from app.services.observability import hash_session_token

settings = get_settings()

_redis: Optional[Redis] = None


def get_redis() -> Redis:
    """Get or create the module-level Redis connection."""
    global _redis
    if _redis is None:
        _redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis


def set_redis(client: Redis) -> None:
    """Override the module-level Redis client (used during startup)."""
    global _redis
    _redis = client


SESSION_PREFIX = "session:"
SESSION_TTL = settings.SESSION_EXPIRE_HOURS * 3600


class SessionService:
    """Redis-backed session management."""

    def __init__(self, db: DBSession):
        self.db = db
        self.r = get_redis()

    def create_session(
        self,
        user: User,
        auth_level: str = "full",
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> "SessionData":
        if auth_level not in {"pending_mfa", "full"}:
            raise ValueError("Invalid auth_level")

        token = secrets.token_urlsafe(32)
        now = datetime.now(timezone.utc).isoformat()
        payload = {
            "user_id": user.id,
            "auth_level": auth_level,
            "created_at": now,
            "last_seen_at": now,
            "mfa_verified_at": now if auth_level == "full" else None,
            "ip_address": ip_address,
            "user_agent": (user_agent or "")[:512] or None,
            "csrf_token": secrets.token_urlsafe(32),
        }
        self.r.setex(f"{SESSION_PREFIX}{token}", SESSION_TTL, json.dumps(payload))
        return SessionData.from_payload(token, payload)

    def get_session_from_token(self, token: str, touch: bool = True) -> Optional["SessionData"]:
        raw = self.r.get(f"{SESSION_PREFIX}{token}")
        if raw is None:
            return None
        data = json.loads(raw)
        if touch:
            data["last_seen_at"] = datetime.now(timezone.utc).isoformat()
            ttl = self.r.ttl(f"{SESSION_PREFIX}{token}")
            self.r.setex(f"{SESSION_PREFIX}{token}", ttl if ttl > 0 else SESSION_TTL, json.dumps(data))
        return SessionData.from_payload(token, data)

    def get_user_from_token(self, token: str) -> Optional[User]:
        session = self.get_session_from_token(token)
        if session is None:
            return None
        return self.db.query(User).filter(User.id == session.user_id).first()

    def get_user_and_session_from_token(
        self, token: str
    ) -> tuple[Optional[User], Optional["SessionData"]]:
        session = self.get_session_from_token(token)
        if session is None:
            return None, None
        user = self.db.query(User).filter(User.id == session.user_id).first()
        return user, session

    def get_or_create_csrf_token(self, token: str) -> Optional[str]:
        key = f"{SESSION_PREFIX}{token}"
        raw = self.r.get(key)
        if raw is None:
            return None
        data = json.loads(raw)
        csrf_token = data.get("csrf_token") or secrets.token_urlsafe(32)
        data["csrf_token"] = csrf_token
        data["last_seen_at"] = datetime.now(timezone.utc).isoformat()
        ttl = self.r.ttl(key)
        self.r.setex(key, ttl if ttl > 0 else SESSION_TTL, json.dumps(data))
        return csrf_token

    def validate_csrf_token(self, session_token: str, csrf_token: Optional[str]) -> bool:
        if not csrf_token:
            return False
        raw = self.r.get(f"{SESSION_PREFIX}{session_token}")
        if raw is None:
            return False
        data = json.loads(raw)
        expected = data.get("csrf_token")
        return bool(expected and secrets.compare_digest(expected, csrf_token))

    def promote_session_to_full(self, token: str) -> bool:
        raw = self.r.get(f"{SESSION_PREFIX}{token}")
        if raw is None:
            return False
        data = json.loads(raw)
        data["auth_level"] = "full"
        data["mfa_verified_at"] = datetime.now(timezone.utc).isoformat()
        data["last_seen_at"] = datetime.now(timezone.utc).isoformat()
        ttl = self.r.ttl(f"{SESSION_PREFIX}{token}")
        self.r.setex(f"{SESSION_PREFIX}{token}", ttl if ttl > 0 else SESSION_TTL, json.dumps(data))
        return True

    def delete_session_by_token(self, token: str) -> bool:
        return self.r.delete(f"{SESSION_PREFIX}{token}") > 0

    def list_user_sessions(self, user_id: str, current_token: Optional[str] = None) -> list["SessionData"]:
        """List active sessions for a user without exposing bearer tokens."""
        sessions: list[SessionData] = []
        for key in self.r.scan_iter(f"{SESSION_PREFIX}*"):
            raw = self.r.get(key)
            if not raw:
                continue
            data = json.loads(raw)
            if data.get("user_id") != user_id:
                continue
            token = key[len(SESSION_PREFIX):]
            session = SessionData.from_payload(token, data)
            session.current = bool(current_token and secrets.compare_digest(token, current_token))
            sessions.append(session)
        return sorted(sessions, key=lambda s: s.last_seen_at or "", reverse=True)

    def delete_all_user_sessions(self, user_id: str, keep_token: Optional[str] = None) -> int:
        """Delete every session belonging to a user, optionally keeping one."""
        count = 0
        for key in self.r.scan_iter(f"{SESSION_PREFIX}*"):
            raw = self.r.get(key)
            if raw:
                data = json.loads(raw)
                token = key[len(SESSION_PREFIX):]
                if data.get("user_id") == user_id and not (keep_token and secrets.compare_digest(token, keep_token)):
                    self.r.delete(key)
                    count += 1
        return count


class SessionData:
    """Lightweight object returned after creating or reading a session."""

    def __init__(
        self,
        token: str,
        user_id: str,
        auth_level: str = "full",
        created_at: Optional[str] = None,
        last_seen_at: Optional[str] = None,
        mfa_verified_at: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        csrf_token: Optional[str] = None,
        current: bool = False,
    ):
        self.token = token
        self.id = token
        self.session_id_hash = hash_session_token(token)
        self.user_id = user_id
        self.auth_level = auth_level
        self.created_at = created_at
        self.last_seen_at = last_seen_at
        self.mfa_verified_at = mfa_verified_at
        self.ip_address = ip_address
        self.user_agent = user_agent
        self.csrf_token = csrf_token
        self.current = current

    @classmethod
    def from_payload(cls, token: str, payload: dict[str, Any]) -> "SessionData":
        return cls(
            token=token,
            user_id=payload["user_id"],
            auth_level=payload.get("auth_level", "full"),
            created_at=payload.get("created_at"),
            last_seen_at=payload.get("last_seen_at"),
            mfa_verified_at=payload.get("mfa_verified_at"),
            ip_address=payload.get("ip_address"),
            user_agent=payload.get("user_agent"),
            csrf_token=payload.get("csrf_token"),
        )
