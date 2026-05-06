"""
SharedLink Model — Password-protected, expiring share links

Zero-knowledge link sharing:
- Link key lives in URL fragment (never sent to server)
- FileKey is encrypted with link key (server can't decrypt)
- Optional password protection via bcrypt
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, JSON, Integer, Boolean, ForeignKey, Index
from sqlalchemy.orm import relationship
from app.database import Base


class SharedLink(Base):
    __tablename__ = "shared_links"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    file_id = Column(String(36), ForeignKey("files.id", ondelete="CASCADE"), nullable=False, index=True)
    owner_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Unique URL-safe token for the link
    token = Column(String(64), unique=True, nullable=False, index=True)

    # FileKey encrypted with link key (JSON blob)
    encrypted_file_key = Column(JSON, nullable=False)

    # Filename encrypted with link key (JSON blob)
    encrypted_filename = Column(JSON, nullable=False)

    # Optional bcrypt hash of link password
    password_hash = Column(String(255), nullable=True)

    # Optional expiration
    expires_at = Column(DateTime, nullable=True)

    # Optional download cap
    max_downloads = Column(Integer, nullable=True)
    download_count = Column(Integer, nullable=False, default=0)

    is_active = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    file = relationship("File", backref="links")
    owner = relationship("User", backref="shared_links")

    @property
    def is_expired(self) -> bool:
        if self.expires_at and datetime.utcnow() > self.expires_at:
            return True
        return False

    @property
    def downloads_exhausted(self) -> bool:
        if self.max_downloads is not None and self.download_count >= self.max_downloads:
            return True
        return False

    @property
    def is_available(self) -> bool:
        return self.is_active and not self.is_expired and not self.downloads_exhausted

    def __repr__(self):
        return f"<SharedLink {self.token} file={self.file_id}>"
