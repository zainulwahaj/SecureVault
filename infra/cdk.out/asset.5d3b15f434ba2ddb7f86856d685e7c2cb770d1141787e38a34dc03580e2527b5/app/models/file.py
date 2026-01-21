"""
File Model - Encrypted File Storage

Zero-Knowledge File Storage Model:
- Stores encrypted file metadata (backend cannot read)
- Stores encrypted FileKey (encrypted with user's VaultKey)
- Original filename is encrypted (backend never sees real name)
- File content stored separately as encrypted blob
- Backend is cryptographically blind to file contents

SECURITY:
- encrypted_file_key: FileKey encrypted with VaultKey (client-side)
- encrypted_filename: Original filename encrypted with FileKey
- Backend stores only opaque encrypted blobs
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text, JSON, Integer, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class File(Base):
    """
    Encrypted file metadata model.
    
    SECURITY ARCHITECTURE:
    - FileKey is random per-file, encrypts file content
    - FileKey is encrypted with VaultKey before storage
    - Original filename is encrypted with FileKey
    - Backend sees only: encrypted blobs + encrypted filename
    - Backend CANNOT decrypt files or know their real names
    """
    __tablename__ = "files"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # Owner of the file
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    
    # FileKey encrypted with user's VaultKey (JSON blob with ciphertext, algorithm, version)
    # Only the user can decrypt this with their VaultKey
    encrypted_file_key = Column(JSON, nullable=False)
    
    # Original filename encrypted with FileKey (JSON blob)
    # Even the filename is zero-knowledge
    encrypted_filename = Column(JSON, nullable=False)
    
    # MIME type encrypted with FileKey (JSON blob)
    # Optional - can be null if client doesn't provide
    encrypted_mime_type = Column(JSON, nullable=True)
    
    # Storage path (UUID-based, no real filename revealed)
    # Format: uploads/{user_id}/{file_id}
    storage_path = Column(String(255), nullable=False, unique=True)
    
    # Encrypted file size in bytes (actual ciphertext size, not plaintext)
    encrypted_size = Column(Integer, nullable=False)
    
    # Metadata timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationship to user (for queries)
    user = relationship("User", back_populates="files")
    
    def __repr__(self):
        return f"<File {self.id} user={self.user_id}>"
