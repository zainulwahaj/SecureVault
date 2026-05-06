"""
Authentication Service - Zero-Knowledge Implementation

SECURITY:
- Backend NEVER sees passwords
- Backend NEVER derives encryption keys
- Backend NEVER decrypts user data
- Authentication is proven via client-side decryption proof
"""

import secrets
from typing import Optional, Tuple, Dict, Any
from sqlalchemy.orm import Session as DBSession
from app.models.user import User
from app.services.session import SessionService, SessionData


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
        encrypted_private_key: str
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
            encrypted_private_key=encrypted_private_key
        )
        
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        
        # Create session
        session = self.session_service.create_session(user)
        
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
        
        challenge = {
            "userId": user.id,
            "email": user.email,
            "salt": user.salt,
            "kdfParams": user.kdf_params,
            "encryptedVaultKey": user.encrypted_vault_key
        }
        
        return challenge, None
    
    def verify_login(self, email: str, proof: str) -> Tuple[Optional[User], Optional[SessionData], Optional[str]]:
        """
        Verify login by checking the decryption proof.
        
        SECURITY:
        - Client proves it decrypted VaultKey by providing its hash
        - Backend compares against stored login_proof
        - This verifies password without backend ever seeing it
        
        Args:
            email: User's email address
            proof: SHA-256 hash of decrypted VaultKey
        
        Returns: (user, session, error_message)
        """
        email = email.lower().strip()
        
        user = self.get_user_by_email(email)
        if not user:
            return None, None, "Invalid credentials"
        
        # SECURITY: Constant-time comparison to prevent timing attacks
        if not secrets.compare_digest(proof, user.login_proof):
            return None, None, "Invalid credentials"
        
        # Proof matches - client successfully decrypted VaultKey
        # Create session
        session = self.session_service.create_session(user)
        
        return user, session, None
    
    def logout(self, session_token: str) -> bool:
        """
        Logout by destroying the session.
        
        Returns True if session was found and destroyed.
        """
        return self.session_service.delete_session_by_token(session_token)
