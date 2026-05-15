"""Per-device public keys for sharing envelopes."""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text, ForeignKey, Boolean, Index, UniqueConstraint
from sqlalchemy.orm import relationship
from app.database import Base


class DeviceKey(Base):
    __tablename__ = "device_keys"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    device_label = Column(String(120), nullable=True)
    encryption_public_key = Column(Text, nullable=False)
    signing_public_key = Column(Text, nullable=True)
    fingerprint = Column(String(95), nullable=False, index=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    revoked_at = Column(DateTime, nullable=True)

    user = relationship("User", backref="device_keys")

    __table_args__ = (
        UniqueConstraint("user_id", "encryption_public_key", name="uq_device_key_material"),
        Index("ix_device_keys_user_active", "user_id", "is_active", "revoked_at"),
    )
