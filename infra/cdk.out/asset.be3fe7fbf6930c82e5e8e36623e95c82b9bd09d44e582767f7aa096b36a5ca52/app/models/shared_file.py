"""
SharedFile Model - Envelope Encryption for File Sharing

Zero-Knowledge File Sharing:
- Original file stays encrypted with FileKey
- FileKey is re-encrypted for recipient using their public key
- Recipient decrypts FileKey with their private key
- Backend CANNOT decrypt shared files or FileKeys

SECURITY:
- encrypted_file_key_for_recipient: FileKey encrypted with recipient's X25519 public key
- Only recipient can decrypt with their private key (which requires their VaultKey)
- Owner can revoke access by deleting the share record
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, JSON, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from app.database import Base


class SharedFile(Base):
    """
    Shared file record for envelope encryption.
    
    SECURITY ARCHITECTURE:
    1. Owner has file encrypted with FileKey
    2. FileKey is encrypted with owner's VaultKey (in files table)
    3. To share: Owner encrypts FileKey with recipient's public key
    4. This record stores that recipient-specific encrypted FileKey
    5. Recipient decrypts FileKey using their private key
    6. Recipient can then decrypt file content
    
    The file content is NEVER re-encrypted or duplicated.
    Only the FileKey is re-encrypted for each recipient.
    """
    __tablename__ = "shared_files"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # The file being shared
    file_id = Column(String(36), ForeignKey("files.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Owner of the file (who is sharing)
    owner_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Recipient (who receives access)
    recipient_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # FileKey encrypted with recipient's X25519 public key
    # Uses crypto_box_seal (anonymous box) - encrypted for recipient's public key
    # JSON blob with ciphertext, algorithm, version
    encrypted_file_key_for_recipient = Column(JSON, nullable=False)
    
    # Optional: permissions (read-only for now, could extend later)
    # permission = Column(String(20), default="read", nullable=False)
    
    # Timestamps
    shared_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    file = relationship("File", backref="shares")
    owner = relationship("User", foreign_keys=[owner_id], backref="files_shared_by_me")
    recipient = relationship("User", foreign_keys=[recipient_id], backref="files_shared_with_me")
    
    # Ensure a file can only be shared once with each recipient
    __table_args__ = (
        UniqueConstraint('file_id', 'recipient_id', name='unique_file_recipient'),
    )
    
    def __repr__(self):
        return f"<SharedFile file={self.file_id} recipient={self.recipient_id}>"
