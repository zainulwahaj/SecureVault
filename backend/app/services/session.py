"""
Session Management Service — Redis-backed

Sessions are stored in Redis with automatic TTL expiry.
Session tokens authorize API requests but do NOT grant access
to encryption keys — all cryptographic operations happen client-side.
"""

import json
import secrets
from datetime import datetime, timezone
from typing import Optional
from redis import Redis
from sqlalchemy.orm import Session as DBSession
from app.models.user import User
from app.config import get_settings

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

    def create_session(self, user: User) -> "SessionData":
        token = secrets.token_urlsafe(32)
        payload = json.dumps({
            "user_id": user.id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        self.r.setex(f"{SESSION_PREFIX}{token}", SESSION_TTL, payload)
        return SessionData(token=token, user_id=user.id)

    def get_user_from_token(self, token: str) -> Optional[User]:
        raw = self.r.get(f"{SESSION_PREFIX}{token}")
        if raw is None:
            return None
        data = json.loads(raw)
        return self.db.query(User).filter(User.id == data["user_id"]).first()

    def delete_session_by_token(self, token: str) -> bool:
        return self.r.delete(f"{SESSION_PREFIX}{token}") > 0

    def delete_all_user_sessions(self, user_id: str) -> int:
        """Delete every session belonging to a user (scan-based)."""
        count = 0
        for key in self.r.scan_iter(f"{SESSION_PREFIX}*"):
            raw = self.r.get(key)
            if raw:
                data = json.loads(raw)
                if data.get("user_id") == user_id:
                    self.r.delete(key)
                    count += 1
        return count


class SessionData:
    """Lightweight object returned after creating a session."""

    def __init__(self, token: str, user_id: str):
        self.token = token
        self.id = token  # used by auth router for SessionResponse
        self.user_id = user_id
