"""
Session Model

Manages user sessions for authentication.
Sessions are random tokens that authorize API requests.

SECURITY NOTE:
- Session tokens are random and unguessable
- Sessions do NOT grant access to cryptographic keys
- Expiration is enforced server-side
"""

import uuid
import secrets
from datetime import datetime, timedelta
from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base
from app.config import get_settings

settings = get_settings()


def generate_session_token() -> str:
    """Generate a cryptographically secure session token"""
    return secrets.token_urlsafe(32)


def get_expiration_time() -> datetime:
    """Calculate session expiration time"""
    return datetime.utcnow() + timedelta(hours=settings.SESSION_EXPIRE_HOURS)


class Session(Base):
    """
    User session for authentication.
    
    The session token is used only for authorization.
    It does NOT grant access to encryption keys or file contents.
    """
    __tablename__ = "sessions"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    token = Column(String(64), unique=True, nullable=False, index=True, default=generate_session_token)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, default=get_expiration_time, nullable=False)
    
    # Relationships
    user = relationship("User", back_populates="sessions")
    
    @property
    def is_expired(self) -> bool:
        """Check if session has expired"""
        return datetime.utcnow() > self.expires_at
    
    def __repr__(self):
        return f"<Session {self.id} for user {self.user_id}>"
