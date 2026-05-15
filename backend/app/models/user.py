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
from sqlalchemy import Column, String, DateTime, Text, JSON, Boolean, Integer, BigInteger
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
    display_name = Column(String(100), nullable=True)
    avatar_url = Column(Text, nullable=True)
    
    # Zero-Knowledge Auth Fields
    # Salt for PBKDF2 key derivation (base64 encoded)
    salt = Column(Text, nullable=False)
    
    # KDF parameters as JSON (algorithm, iterations, keyLength, version)
    kdf_params = Column(JSON, nullable=False)
    
    # VaultKey encrypted with KEK (JSON blob with ciphertext, algorithm, version)
    encrypted_vault_key = Column(JSON, nullable=False)
    
    # SHA-256 hash of VaultKey - proves decryption succeeded without revealing key
    # LEGACY: kept only for old accounts that have not upgraded to auth signing keys.
    # New logins must use challenge-bound signatures, not this reusable proof.
    login_proof = Column(String(64), nullable=False)

    # Challenge-bound authentication signing key.
    # The backend stores only the public key and verifies signatures over
    # one-time challenges. The private key is encrypted client-side with VaultKey.
    auth_public_key = Column(Text, nullable=True)
    encrypted_auth_private_key = Column(JSON, nullable=True)
    auth_key_version = Column(String(20), default="ed25519-v1", nullable=False)
    
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

    # Server-verifiable TOTP secret.
    # This is a deliberate tradeoff: file/vault data remains zero-knowledge,
    # but TOTP itself must be server-verifiable to be an enforceable MFA factor.
    server_mfa_secret = Column(Text, nullable=True)
    
    # Recovery codes (hashed) - for account recovery if TOTP device lost
    # Stored as JSON array of hashed codes
    # Plain codes shown once during setup, then only hashes stored
    recovery_codes_hash = Column(JSON, nullable=True)

    # Account-recovery key (separate from MFA recovery codes).
    # The user generates a long random secret at registration / opt-in.
    # The VaultKey is wrapped with a KEK derived from that secret + recovery_salt
    # via PBKDF2. Backend can never derive the secret or unwrap the VaultKey.
    recovery_enabled = Column(Boolean, default=False, nullable=False)
    recovery_salt = Column(Text, nullable=True)
    recovery_kdf_params = Column(JSON, nullable=True)
    encrypted_vault_key_recovery = Column(JSON, nullable=True)

    # Plan / policy fields. Per-account overrides take precedence over the
    # plan defaults defined in app.services.policy.
    plan = Column(String(20), default="free", nullable=False)
    plan_storage_bytes = Column(BigInteger, nullable=True)
    plan_max_file_bytes = Column(BigInteger, nullable=True)
    plan_max_file_count = Column(Integer, nullable=True)
    plan_max_versions_per_file = Column(Integer, nullable=True)
    plan_max_links_per_file = Column(Integer, nullable=True)
    plan_max_link_expiry_days = Column(Integer, nullable=True)
    plan_max_trash_days = Column(Integer, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    files = relationship("File", back_populates="user", cascade="all, delete-orphan")
    folders = relationship("Folder", back_populates="user", cascade="all, delete-orphan")
    keys = relationship("UserKey", back_populates="user", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<User {self.email}>"
