"""
AuditLog Model — Tracks user actions for activity log
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, JSON, ForeignKey, Index, Integer
from app.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # Action performed (e.g. "file.upload", "auth.login", "share.create")
    action = Column(String(50), nullable=False)

    # Event classification for filtering, alerting, and retention policy
    category = Column(String(30), nullable=False, default="application")
    outcome = Column(String(20), nullable=False, default="success")
    severity = Column(String(20), nullable=False, default="info")

    # Type of resource involved (e.g. "file", "folder", "share", "auth")
    resource_type = Column(String(30), nullable=True)

    # ID of the resource (file id, folder id, etc.)
    resource_id = Column(String(36), nullable=True)

    # Extra details (JSON — e.g. filename hash, recipient email)
    details = Column(JSON, nullable=True)

    # Request metadata
    request_id = Column(String(128), nullable=True)
    session_id_hash = Column(String(64), nullable=True)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(512), nullable=True)

    # Per-user hash chain for tamper-evident audit history.
    sequence_number = Column(Integer, nullable=True)
    prev_hash = Column(String(64), nullable=True)
    event_hash = Column(String(64), nullable=True)
    hash_version = Column(String(20), nullable=False, default="hmac-sha256-v1")

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("ix_audit_user_created", "user_id", "created_at"),
        Index("ix_audit_user_action_created", "user_id", "action", "created_at"),
        Index("ix_audit_user_sequence", "user_id", "sequence_number", unique=True),
        Index("ix_audit_request_id", "request_id"),
        Index("ix_audit_event_hash", "event_hash"),
    )

    def __repr__(self):
        return f"<AuditLog {self.action} user={self.user_id}>"
