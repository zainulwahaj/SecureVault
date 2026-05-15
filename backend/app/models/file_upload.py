"""Chunked/resumable upload models."""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, JSON, Integer, ForeignKey, Index, UniqueConstraint
from sqlalchemy.orm import relationship
from app.database import Base


class FileUploadSession(Base):
    __tablename__ = "file_upload_sessions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    file_id = Column(String(36), nullable=False)
    folder_id = Column(String(36), ForeignKey("folders.id", ondelete="SET NULL"), nullable=True)
    idempotency_key = Column(String(128), nullable=True)
    status = Column(String(20), default="active", nullable=False)
    encrypted_file_key = Column(JSON, nullable=False)
    encrypted_filename = Column(JSON, nullable=False)
    encrypted_mime_type = Column(JSON, nullable=True)
    total_parts = Column(Integer, nullable=False)
    total_size = Column(Integer, nullable=False)
    chunk_size = Column(Integer, nullable=False)
    manifest = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)
    aborted_at = Column(DateTime, nullable=True)

    parts = relationship("FileChunk", back_populates="upload", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("user_id", "idempotency_key", name="uq_upload_user_idempotency"),
        Index("ix_file_upload_sessions_user_status", "user_id", "status"),
    )


class FileChunk(Base):
    __tablename__ = "file_chunks"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    upload_id = Column(String(36), ForeignKey("file_upload_sessions.id", ondelete="CASCADE"), nullable=True, index=True)
    file_id = Column(String(36), ForeignKey("files.id", ondelete="CASCADE"), nullable=True, index=True)
    version_id = Column(String(36), ForeignKey("file_versions.id", ondelete="CASCADE"), nullable=True, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    part_number = Column(Integer, nullable=False)
    storage_path = Column(String(255), nullable=False, unique=True)
    encrypted_size = Column(Integer, nullable=False)
    content_sha256 = Column(String(64), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    upload = relationship("FileUploadSession", back_populates="parts")

    __table_args__ = (
        UniqueConstraint("upload_id", "part_number", name="uq_upload_part_number"),
        Index("ix_file_chunks_file_part", "file_id", "part_number"),
        Index("ix_file_chunks_version_part", "version_id", "part_number"),
    )
