"""
FileVersion Model — Stores historical versions of encrypted files

When a file is re-uploaded, the previous content is saved as a version.
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, JSON, Integer, ForeignKey, Index
from sqlalchemy.orm import relationship
from app.database import Base


class FileVersion(Base):
    __tablename__ = "file_versions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    file_id = Column(String(36), ForeignKey("files.id", ondelete="CASCADE"), nullable=False, index=True)
    version_number = Column(Integer, nullable=False)

    # Storage path for this version's encrypted content
    storage_path = Column(String(255), nullable=False, unique=True)

    # FileKey encrypted with VaultKey (snapshot at time of version creation)
    encrypted_file_key = Column(JSON, nullable=False)

    # Encrypted file size in bytes
    encrypted_size = Column(Integer, nullable=False)

    # SHA-256 over encrypted bytes for retained version integrity checks
    content_sha256 = Column(String(64), nullable=True)
    storage_mode = Column(String(20), default="single", nullable=False)
    chunk_manifest = Column(JSON, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    file = relationship("File", back_populates="versions")

    __table_args__ = (
        Index("ix_file_versions_file_version", "file_id", "version_number"),
    )

    def __repr__(self):
        return f"<FileVersion {self.id} file={self.file_id} v{self.version_number}>"
