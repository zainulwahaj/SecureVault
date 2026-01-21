"""
User Model

Zero-Knowledge Authentication Model:
- Stores salt for key derivation
- Stores KDF parameters for future compatibility
- Stores encrypted VaultKey (encrypted client-side with KEK)
- Stores login proof (hash of VaultKey for verification)
- Stores public key for envelope encryption (file sharing)
- Stores encrypted private key (encrypted with VaultKey)
- Stores MFA secret encrypted with VaultKey (TOTP)
- Backend CANNOT decrypt VaultKey, private key, MFA secret, or derive user's password
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text, JSON, Boolean
from sqlalchemy.orm import relationship
from app.database import Base


class User(Base):
    """
    User account model with zero-knowledge authentication.
    
    SECURITY:
    - password is NEVER stored (client derives KEK from it)
    - salt is random per-user for key derivation
    - encrypted_vault_key can only be decrypted client-side
    - login_proof verifies successful decryption without revealing key
    - public_key is used for envelope encryption (sharing files)
    - encrypted_private_key can only be decrypted with VaultKey
    - MFA secret is encrypted with VaultKey (TOTP codes generated client-side)
    """
    __tablename__ = "users"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, nullable=False, index=True)
    
    # Zero-Knowledge Auth Fields
    # Salt for PBKDF2 key derivation (base64 encoded)
    salt = Column(Text, nullable=False)
    
    # KDF parameters as JSON (algorithm, iterations, keyLength, version)
    kdf_params = Column(JSON, nullable=False)
    
    # VaultKey encrypted with KEK (JSON blob with ciphertext, algorithm, version)
    encrypted_vault_key = Column(JSON, nullable=False)
    
    # SHA-256 hash of VaultKey - proves decryption succeeded without revealing key
    login_proof = Column(String(64), nullable=False)
    
    # Envelope Encryption Fields (for file sharing)
    # X25519 public key (base64 encoded) - anyone can encrypt for this user
    public_key = Column(Text, nullable=True)
    
    # X25519 private key encrypted with VaultKey (JSON blob)
    # Only the user can decrypt this with their VaultKey
    encrypted_private_key = Column(JSON, nullable=True)
    
    # MFA Fields (Zero-Knowledge TOTP)
    # Whether MFA is enabled for this account
    mfa_enabled = Column(Boolean, default=False, nullable=False)
    
    # TOTP secret encrypted with VaultKey (JSON blob)
    # Client generates TOTP codes using decrypted secret
    # Backend NEVER sees the plaintext secret
    encrypted_mfa_secret = Column(JSON, nullable=True)
    
    # Recovery codes (hashed) - for account recovery if TOTP device lost
    # Stored as JSON array of hashed codes
    # Plain codes shown once during setup, then only hashes stored
    recovery_codes_hash = Column(JSON, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    sessions = relationship("Session", back_populates="user", cascade="all, delete-orphan")
    files = relationship("File", back_populates="user", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<User {self.email}>"
