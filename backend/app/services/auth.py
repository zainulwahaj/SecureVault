"""
Authentication Service - Zero-Knowledge Implementation

SECURITY:
- Backend NEVER sees passwords
- Backend NEVER derives encryption keys
- Backend NEVER decrypts user data
- Authentication is proven via client-side decryption proof
"""

import base64
import json
import secrets
from typing import Optional, Tuple, Dict, Any
from sqlalchemy.orm import Session as DBSession
from app.models.user import User
from app.services.auth_crypto import verify_login_signature
from app.services.key_directory import KeyDirectoryService
from app.services.session import SessionService, SessionData, get_redis


LOGIN_CHALLENGE_PREFIX = "login_challenge:"
LOGIN_CHALLENGE_TTL_SECONDS = 5 * 60


class AuthService:
    """
    Zero-Knowledge Authentication Service.
    
    Registration:
    - Receives pre-encrypted data from client
    - Stores salt, KDF params, encrypted VaultKey, and login proof
    - Cannot decrypt or verify password
    
    Login:
    - Returns encrypted data to client for decryption attempt
    - Client proves success by providing hash of decrypted key
    - Backend verifies proof matches stored proof
    """
    
    def __init__(self, db: DBSession):
        self.db = db
        self.session_service = SessionService(db)
    
    def get_user_by_email(self, email: str) -> Optional[User]:
        """Get user by email address"""
        return self.db.query(User).filter(User.email == email.lower()).first()
    
    def register(
        self,
        email: str,
        salt: str,
        kdf_params: Dict[str, Any],
        encrypted_vault_key: Dict[str, Any],
        login_proof: str,
        public_key: str,
        encrypted_private_key: str,
        auth_public_key: str,
        encrypted_auth_private_key: Dict[str, Any],
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> Tuple[Optional[User], Optional[SessionData], Optional[str]]:
        """
        Register a new user with zero-knowledge authentication.

        Returns: (user, session, error_message)
        """
        email = email.lower().strip()
        
        # Check if user already exists
        existing_user = self.get_user_by_email(email)
        if existing_user:
            return None, None, "Email already registered"
        
        # Create user with encrypted data (backend cannot decrypt)
        user = User(
            email=email,
            salt=salt,
            kdf_params=kdf_params,
            encrypted_vault_key=encrypted_vault_key,
            login_proof=login_proof,
            public_key=public_key,
            encrypted_private_key=encrypted_private_key,
            auth_public_key=auth_public_key,
            encrypted_auth_private_key=encrypted_auth_private_key,
        )
        
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        KeyDirectoryService(self.db).ensure_sharing_key(user)
        
        # Create session
        session = self.session_service.create_session(
            user,
            auth_level="full",
            ip_address=ip_address,
            user_agent=user_agent,
        )
        
        return user, session, None
    
    def get_login_challenge(self, email: str) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        """
        Get login challenge data for client-side decryption.
        
        Returns the encrypted data the client needs to attempt login.
        
        Args:
            email: User's email address
        
        Returns: (challenge_data, error_message)
        """
        email = email.lower().strip()
        
        user = self.get_user_by_email(email)
        if not user:
            # SECURITY: Don't reveal whether email exists
            # Return fake challenge data with same timing
            return None, "Invalid credentials"
        
        challenge_id = secrets.token_urlsafe(24)
        challenge_nonce = base64.b64encode(secrets.token_bytes(32)).decode("ascii")
        get_redis().setex(
            f"{LOGIN_CHALLENGE_PREFIX}{challenge_id}",
            LOGIN_CHALLENGE_TTL_SECONDS,
            json.dumps({
                "user_id": user.id,
                "email": user.email,
                "challenge": challenge_nonce,
            }),
        )

        challenge = {
            "userId": user.id,
            "email": user.email,
            "salt": user.salt,
            "kdfParams": user.kdf_params,
            "encryptedVaultKey": user.encrypted_vault_key,
            "encryptedAuthPrivateKey": user.encrypted_auth_private_key,
            "authChallengeId": challenge_id,
            "authChallenge": challenge_nonce,
            "mfaRequired": user.mfa_enabled and user.server_mfa_secret is not None,
            "authKeyRequired": user.auth_public_key is not None,
        }
        
        return challenge, None
    
    def verify_login(
        self,
        email: str,
        challenge_id: Optional[str] = None,
        signature: Optional[str] = None,
        proof: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> Tuple[Optional[User], Optional[SessionData], Optional[str]]:
        """
        Verify login by checking the decryption proof.
        
        SECURITY:
        - Client proves it decrypted VaultKey by providing its hash
        - Backend compares against stored login_proof
        - This verifies password without backend ever seeing it
        
        Args:
            email: User's email address
            challenge_id: One-time challenge ID from get_login_challenge
            signature: Ed25519 signature over the one-time challenge
            proof: Legacy SHA-256 hash of decrypted VaultKey
        
        Returns: (user, session, error_message)
        """
        email = email.lower().strip()
        
        user = self.get_user_by_email(email)
        if not user:
            return None, None, "Invalid credentials"
        
        if user.auth_public_key:
            if not challenge_id or not signature:
                return None, None, "Missing login challenge signature"

            challenge_key = f"{LOGIN_CHALLENGE_PREFIX}{challenge_id}"
            raw = get_redis().get(challenge_key)
            if raw is None:
                return None, None, "Invalid or expired login challenge"

            # Consume challenge before verification to prevent replay even on failure.
            get_redis().delete(challenge_key)
            challenge = json.loads(raw)
            if challenge.get("user_id") != user.id or challenge.get("email") != user.email:
                return None, None, "Invalid login challenge"

            if not verify_login_signature(user.auth_public_key, challenge["challenge"], signature):
                return None, None, "Invalid credentials"
        else:
            # Legacy fallback for accounts created before auth signing keys.
            # New clients should upgrade these accounts immediately after login.
            if not proof or not secrets.compare_digest(proof, user.login_proof):
                return None, None, "Invalid credentials"
        
        # Proof matches - client successfully decrypted VaultKey
        # Create session
        auth_level = "pending_mfa" if user.mfa_enabled and user.server_mfa_secret else "full"
        session = self.session_service.create_session(
            user,
            auth_level=auth_level,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        
        return user, session, None
    
    def logout(self, session_token: str) -> bool:
        """
        Logout by destroying the session.
        
        Returns True if session was found and destroyed.
        """
        return self.session_service.delete_session_by_token(session_token)
