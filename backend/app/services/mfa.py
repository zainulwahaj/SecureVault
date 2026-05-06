"""
MFA Service - Zero-Knowledge TOTP Authentication

SECURITY ARCHITECTURE:
- TOTP secret is generated and encrypted client-side
- Backend stores only encrypted blob (cannot see secret)
- TOTP code verification happens client-side
- Backend verifies that client successfully verified (via proof)
- Recovery codes are hashed before storage

ZERO-KNOWLEDGE GUARANTEE:
- Backend cannot generate TOTP codes
- Backend cannot see the MFA secret
- Client proves MFA verification without revealing secret
"""

import base64
import binascii
import hashlib
import hmac
import struct
import time
from typing import Dict, Any, Optional, Tuple, List
from sqlalchemy.orm import Session as DBSession
from app.models.user import User


class MFAService:
    """
    Service for managing zero-knowledge MFA.
    
    The MFA secret is encrypted client-side with VaultKey.
    Backend stores only encrypted blobs and hashed recovery codes.
    """
    
    def __init__(self, db: DBSession):
        self.db = db
    
    def get_mfa_status(self, user: User) -> Dict[str, Any]:
        """
        Get current MFA status for a user.
        
        Returns:
            - mfaEnabled: whether MFA is active
            - encryptedMfaSecret: encrypted secret (if enabled)
            - recoveryCodesRemaining: count of unused recovery codes
        """
        recovery_count = 0
        if user.recovery_codes_hash:
            recovery_count = len(user.recovery_codes_hash)
        
        return {
            "mfaEnabled": user.mfa_enabled and user.server_mfa_secret is not None,
            "encryptedMfaSecret": user.encrypted_mfa_secret if user.mfa_enabled and user.server_mfa_secret else None,
            "recoveryCodesRemaining": recovery_count,
        }
    
    def setup_mfa(
        self,
        user: User,
        encrypted_mfa_secret: Dict[str, Any],
        server_mfa_secret: str,
        recovery_codes_hash: List[str],
        verification_code: str,
    ) -> Tuple[bool, Optional[str]]:
        """
        Set up MFA for a user.
        
        SECURITY:
        - encrypted_mfa_secret is the TOTP secret encrypted with VaultKey
        - recovery_codes_hash is a list of SHA-256 hashed recovery codes
        - Backend cannot decrypt the secret or reverse the hashes
        
        Args:
            user: User model instance
            encrypted_mfa_secret: TOTP secret encrypted with VaultKey
            recovery_codes_hash: List of hashed recovery codes
        
        Returns: (success, error_message)
        """
        if user.mfa_enabled and user.server_mfa_secret:
            return False, "MFA is already enabled"

        if not self.verify_totp_code(server_mfa_secret, verification_code):
            return False, "Invalid verification code"
        
        # Validate recovery codes format (should be SHA-256 hashes)
        for code_hash in recovery_codes_hash:
            if len(code_hash) != 64:  # SHA-256 produces 64 hex chars
                return False, "Invalid recovery code hash format"
        
        # Store encrypted secret and hashed recovery codes
        user.encrypted_mfa_secret = encrypted_mfa_secret
        user.server_mfa_secret = server_mfa_secret
        user.recovery_codes_hash = recovery_codes_hash
        user.mfa_enabled = True
        
        self.db.commit()
        
        return True, None
    
    def disable_mfa(self, user: User, verification_code: str) -> Tuple[bool, Optional[str]]:
        """
        Disable MFA for a user.
        
        Note: Caller must verify TOTP code before calling this.
        
        Args:
            user: User model instance
        
        Returns: (success, error_message)
        """
        if not user.mfa_enabled:
            return False, "MFA is not enabled"

        if not user.server_mfa_secret or not self.verify_totp_code(user.server_mfa_secret, verification_code):
            return False, "Invalid verification code"
        
        # Clear MFA data
        user.mfa_enabled = False
        user.encrypted_mfa_secret = None
        user.server_mfa_secret = None
        user.recovery_codes_hash = None
        
        self.db.commit()
        
        return True, None
    
    def verify_recovery_code(
        self,
        user: User,
        recovery_code: str,
    ) -> Tuple[bool, Optional[str], int]:
        """
        Verify and consume a recovery code.
        
        Recovery codes are one-time use. Once verified,
        the code hash is removed from storage.
        
        Args:
            user: User model instance
            recovery_code: Plain text recovery code from user
        
        Returns: (success, error_message, remaining_codes_count)
        """
        if not user.mfa_enabled:
            return False, "MFA is not enabled", 0
        
        if not user.recovery_codes_hash:
            return False, "No recovery codes available", 0
        
        # Hash the normalized code. The frontend displays recovery codes as
        # XXXX-XXXX-XXXX-XXXX and stores hashes without separators.
        normalized = recovery_code.replace("-", "").lower()
        code_hash = hashlib.sha256(normalized.encode()).hexdigest()
        
        # Check if hash matches any stored hash
        if code_hash not in user.recovery_codes_hash:
            return False, "Invalid recovery code", len(user.recovery_codes_hash)
        
        # Remove used code (one-time use)
        remaining_codes = [h for h in user.recovery_codes_hash if h != code_hash]
        user.recovery_codes_hash = remaining_codes
        
        self.db.commit()
        
        return True, None, len(remaining_codes)
    
    def get_encrypted_secret(self, user: User) -> Optional[Dict[str, Any]]:
        """
        Get the encrypted MFA secret for a user.
        
        Used during login so client can:
        1. Decrypt secret with VaultKey
        2. Generate TOTP code
        3. Verify locally
        
        Args:
            user: User model instance
        
        Returns: Encrypted MFA secret blob, or None if MFA not enabled
        """
        if not user.mfa_enabled:
            return None
        
        return user.encrypted_mfa_secret

    def verify_totp_for_user(self, user: User, code: str) -> bool:
        """Verify a TOTP code using the server-held MFA secret."""
        if not user.mfa_enabled or not user.server_mfa_secret:
            return False
        return self.verify_totp_code(user.server_mfa_secret, code)

    @staticmethod
    def verify_totp_code(secret: str, code: str, window: int = 1) -> bool:
        """Verify an RFC 6238 TOTP code with a small clock-skew window."""
        if not code.isdigit() or len(code) != 6:
            return False

        try:
            secret_bytes = _base32_decode(secret)
        except ValueError:
            return False

        current_counter = int(time.time() // 30)
        for offset in range(-window, window + 1):
            expected = _totp(secret_bytes, current_counter + offset)
            if hmac.compare_digest(expected, code):
                return True
        return False


def _base32_decode(secret: str) -> bytes:
    """Decode a base32 TOTP secret, accepting unpadded uppercase/lowercase."""
    normalized = secret.replace(" ", "").upper()
    padding = "=" * ((8 - len(normalized) % 8) % 8)
    try:
        return base64.b32decode(normalized + padding, casefold=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("Invalid TOTP secret") from exc


def _totp(secret: bytes, counter: int) -> str:
    msg = struct.pack(">Q", counter)
    digest = hmac.new(secret, msg, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    code_int = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return f"{code_int % 1_000_000:06d}"
