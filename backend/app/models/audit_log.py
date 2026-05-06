"""
AuditLog Model — Tracks user actions for activity log
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, JSON, ForeignKey, Index
from app.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # Action performed (e.g. "file_upload", "login", "share_create")
    action = Column(String(50), nullable=False)

    # Type of resource involved (e.g. "file", "folder", "share", "auth")
    resource_type = Column(String(30), nullable=True)

    # ID of the resource (file id, folder id, etc.)
    resource_id = Column(String(36), nullable=True)

    # Extra details (JSON — e.g. filename hash, recipient email)
    details = Column(JSON, nullable=True)

    # Request metadata
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(512), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("ix_audit_user_created", "user_id", "created_at"),
    )

    def __repr__(self):
        return f"<AuditLog {self.action} user={self.user_id}>"
