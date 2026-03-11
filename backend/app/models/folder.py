"""
Folder Model — Encrypted hierarchical folder structure

Folder names are encrypted client-side with VaultKey.
Backend only sees opaque blobs.
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, JSON, ForeignKey, Index
from sqlalchemy.orm import relationship
from app.database import Base


class Folder(Base):
    __tablename__ = "folders"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    parent_id = Column(String(36), ForeignKey("folders.id", ondelete="CASCADE"), nullable=True, index=True)

    # Folder name encrypted with VaultKey (JSON blob)
    encrypted_name = Column(JSON, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", back_populates="folders")
    parent = relationship("Folder", remote_side=[id], backref="children")
    files = relationship("File", back_populates="folder")

    __table_args__ = (
        Index("ix_folders_user_parent", "user_id", "parent_id"),
    )

    def __repr__(self):
        return f"<Folder {self.id} user={self.user_id}>"
