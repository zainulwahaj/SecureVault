"""Public key directory helpers for sharing."""

import base64
import hashlib
from datetime import datetime
from typing import Optional
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession
from app.models.user import User
from app.models.user_key import UserKey


SHARING_KEY_TYPE = "x25519-sharing"


def public_key_fingerprint(public_key: str) -> str:
    """Return a stable display fingerprint for a base64 public key."""
    try:
        raw = base64.b64decode(public_key, validate=True)
    except ValueError:
        raise ValueError("Invalid sharing public key encoding")
    if len(raw) != 32:
        raise ValueError("Invalid sharing public key length")
    digest = hashlib.sha256(raw).hexdigest().upper()
    return ":".join(digest[i:i + 4] for i in range(0, 32, 4))


class KeyDirectoryService:
    def __init__(self, db: DBSession):
        self.db = db

    def ensure_sharing_key(self, user: User) -> Optional[UserKey]:
        """Create or return the active directory entry for user's sharing key."""
        if not user.public_key:
            return None

        existing = self.db.query(UserKey).filter(
            UserKey.user_id == user.id,
            UserKey.key_type == SHARING_KEY_TYPE,
            UserKey.public_key == user.public_key,
            UserKey.revoked_at.is_(None),
        ).first()
        if existing:
            if not existing.is_active:
                existing.is_active = True
                self.db.commit()
            return existing

        try:
            fingerprint = public_key_fingerprint(user.public_key)
        except ValueError:
            return None

        key = UserKey(
            user_id=user.id,
            key_type=SHARING_KEY_TYPE,
            algorithm="x25519-sealed-box",
            public_key=user.public_key,
            fingerprint=fingerprint,
            version="1",
            is_active=True,
        )
        self.db.add(key)
        try:
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            return self.db.query(UserKey).filter(
                UserKey.user_id == user.id,
                UserKey.key_type == SHARING_KEY_TYPE,
                UserKey.public_key == user.public_key,
                UserKey.revoked_at.is_(None),
            ).first()
        self.db.refresh(key)
        return key

    def rotate_sharing_key(self, user: User, public_key: str) -> UserKey:
        """Mark old active sharing keys revoked and install a new active key."""
        public_key_fingerprint(public_key)
        now = datetime.utcnow()
        for key in self.db.query(UserKey).filter(
            UserKey.user_id == user.id,
            UserKey.key_type == SHARING_KEY_TYPE,
            UserKey.is_active.is_(True),
            UserKey.revoked_at.is_(None),
        ).all():
            if key.public_key != public_key:
                key.is_active = False
                key.revoked_at = now

        user.public_key = public_key
        self.db.commit()
        return self.ensure_sharing_key(user)
