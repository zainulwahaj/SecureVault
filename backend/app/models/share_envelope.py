"""Per-device share envelopes."""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, JSON, ForeignKey, Integer, Index, UniqueConstraint
from sqlalchemy.orm import relationship
from app.database import Base


class ShareEnvelope(Base):
    __tablename__ = "share_envelopes"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    share_id = Column(String(36), ForeignKey("shared_files.id", ondelete="CASCADE"), nullable=False, index=True)
    recipient_device_key_id = Column(String(36), ForeignKey("device_keys.id", ondelete="SET NULL"), nullable=True)
    recipient_user_key_id = Column(String(36), ForeignKey("user_keys.id", ondelete="SET NULL"), nullable=True)
    encrypted_file_key = Column(JSON, nullable=False)
    key_version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    revoked_at = Column(DateTime, nullable=True)

    share = relationship("SharedFile", back_populates="envelopes")
    recipient_device_key = relationship("DeviceKey")
    recipient_user_key = relationship("UserKey")

    __table_args__ = (
        UniqueConstraint("share_id", "recipient_device_key_id", "key_version", name="uq_share_device_envelope"),
        Index("ix_share_envelopes_share_active", "share_id", "revoked_at"),
    )
