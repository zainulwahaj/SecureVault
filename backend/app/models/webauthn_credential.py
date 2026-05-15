"""WebAuthn / passkey credentials registered as a second authentication factor."""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text, JSON, ForeignKey, Integer, Index
from sqlalchemy.orm import relationship
from app.database import Base


class WebAuthnCredential(Base):
    """A WebAuthn public-key credential bound to a user account.

    Stored fields are the minimum the server needs to verify subsequent
    authentication assertions: the credential id, the COSE public key,
    the per-credential sign counter, and the transports + AAGUID for UX.
    """

    __tablename__ = "webauthn_credentials"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    credential_id = Column(Text, nullable=False, unique=True)
    public_key = Column(Text, nullable=False)
    sign_count = Column(Integer, default=0, nullable=False)
    transports = Column(JSON, nullable=True)
    aaguid = Column(String(64), nullable=True)
    label = Column(String(120), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_used_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)

    user = relationship("User", backref="webauthn_credentials")

    __table_args__ = (
        Index("ix_webauthn_credentials_user_active", "user_id", "revoked_at"),
    )
