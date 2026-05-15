"""User public key directory for sharing and trust fingerprints."""

import uuid
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from app.database import Base


class UserKey(Base):
    __tablename__ = "user_keys"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    key_type = Column(String(30), nullable=False, default="x25519-sharing")
    algorithm = Column(String(30), nullable=False, default="x25519-sealed-box")
    public_key = Column(Text, nullable=False)
    fingerprint = Column(String(95), nullable=False, index=True)
    version = Column(String(20), nullable=False, default="1")

    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    revoked_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="keys")

    __table_args__ = (
        UniqueConstraint("user_id", "key_type", "public_key", name="unique_user_key_material"),
    )

    def __repr__(self):
        return f"<UserKey {self.key_type} user={self.user_id}>"
