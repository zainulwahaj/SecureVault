"""Account recovery service.

Implements a zero-knowledge recovery model:
- At opt-in, the client generates a long random secret (the recovery key)
  and a fresh PBKDF2 salt + params.
- The client derives a KEK from (recovery_key, salt), wraps the VaultKey
  with that KEK, and uploads only the wrapped blob + salt + params.
- The backend stores no plaintext recovery material and can never unwrap
  the VaultKey on its own.
- On recovery, the server returns the recovery salt + KDF params + wrapped
  VaultKey to the client. The client unwraps the VaultKey, derives the
  existing auth Ed25519 keypair, signs a server-issued challenge, and
  POSTs new encrypted material (new salt, wrapped VaultKey, etc.) to
  rotate the password without revealing the recovery key to the server.
"""

import base64
import json
import secrets
from typing import Optional, Tuple, Dict, Any
from sqlalchemy.orm import Session as DBSession

from app.models.user import User
from app.services.auth_crypto import verify_login_signature
from app.services.session import SessionService, get_redis


RECOVERY_CHALLENGE_PREFIX = "recovery_challenge:"
RECOVERY_CHALLENGE_TTL_SECONDS = 5 * 60


class RecoveryService:
    def __init__(self, db: DBSession):
        self.db = db
        self.session_service = SessionService(db)

    # ------------------------------------------------------------------
    # Opt-in / disable
    # ------------------------------------------------------------------

    def enable_recovery(
        self,
        user: User,
        recovery_salt: str,
        recovery_kdf_params: Dict[str, Any],
        encrypted_vault_key_recovery: Dict[str, Any],
    ) -> None:
        user.recovery_salt = recovery_salt
        user.recovery_kdf_params = recovery_kdf_params
        user.encrypted_vault_key_recovery = encrypted_vault_key_recovery
        user.recovery_enabled = True
        self.db.commit()
        self.db.refresh(user)

    def disable_recovery(self, user: User) -> None:
        user.recovery_salt = None
        user.recovery_kdf_params = None
        user.encrypted_vault_key_recovery = None
        user.recovery_enabled = False
        self.db.commit()
        self.db.refresh(user)

    # ------------------------------------------------------------------
    # Recovery login (no session)
    # ------------------------------------------------------------------

    def get_recovery_challenge(self, email: str) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        """Return the recovery payload + a one-shot challenge.

        Does not reveal whether the email exists when recovery is disabled —
        instead returns a generic error.
        """
        email = (email or "").lower().strip()
        user = self.db.query(User).filter(User.email == email).first()
        if not user or not user.recovery_enabled or not user.encrypted_vault_key_recovery:
            return None, "Recovery is not configured for this account"

        challenge_id = secrets.token_urlsafe(24)
        challenge_nonce = base64.b64encode(secrets.token_bytes(32)).decode("ascii")
        get_redis().setex(
            f"{RECOVERY_CHALLENGE_PREFIX}{challenge_id}",
            RECOVERY_CHALLENGE_TTL_SECONDS,
            json.dumps({"user_id": user.id, "email": user.email, "challenge": challenge_nonce}),
        )

        return {
            "userId": user.id,
            "email": user.email,
            "recoverySalt": user.recovery_salt,
            "recoveryKdfParams": user.recovery_kdf_params,
            "encryptedVaultKeyRecovery": user.encrypted_vault_key_recovery,
            "recoveryChallengeId": challenge_id,
            "recoveryChallenge": challenge_nonce,
        }, None

    def reset_password(
        self,
        email: str,
        challenge_id: str,
        signature: str,
        new_salt: str,
        new_kdf_params: Dict[str, Any],
        new_encrypted_vault_key: Dict[str, Any],
        new_login_proof: str,
        new_encrypted_auth_private_key: Dict[str, Any],
        new_encrypted_private_key: Optional[str] = None,
        new_recovery_salt: Optional[str] = None,
        new_recovery_kdf_params: Optional[Dict[str, Any]] = None,
        new_encrypted_vault_key_recovery: Optional[Dict[str, Any]] = None,
        new_encrypted_mfa_secret: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> Tuple[Optional[User], Optional[Any], Optional[str]]:
        """Apply a recovery-driven password rotation.

        Authorization is proven by signing `challenge` with the same Ed25519
        auth key that the user already had (which the client just unwrapped
        from VaultKey via the recovery key). Mismatched signatures are
        rejected just like normal login.
        """
        email = (email or "").lower().strip()
        r = get_redis()
        raw = r.get(f"{RECOVERY_CHALLENGE_PREFIX}{challenge_id}")
        if not raw:
            return None, None, "Recovery challenge expired"
        try:
            stored = json.loads(raw)
        except json.JSONDecodeError:
            r.delete(f"{RECOVERY_CHALLENGE_PREFIX}{challenge_id}")
            return None, None, "Invalid recovery challenge"
        if stored.get("email") != email:
            return None, None, "Recovery challenge mismatch"

        user = self.db.query(User).filter(User.id == stored["user_id"]).first()
        if not user or not user.recovery_enabled or not user.auth_public_key:
            r.delete(f"{RECOVERY_CHALLENGE_PREFIX}{challenge_id}")
            return None, None, "Recovery is not configured for this account"

        challenge_b64 = stored["challenge"]
        if not verify_login_signature(user.auth_public_key, challenge_b64, signature):
            return None, None, "Recovery signature invalid"
        r.delete(f"{RECOVERY_CHALLENGE_PREFIX}{challenge_id}")

        # Apply new credential material.
        user.salt = new_salt
        user.kdf_params = new_kdf_params
        user.encrypted_vault_key = new_encrypted_vault_key
        user.login_proof = new_login_proof
        user.encrypted_auth_private_key = new_encrypted_auth_private_key
        if new_encrypted_private_key is not None:
            user.encrypted_private_key = new_encrypted_private_key
        if new_encrypted_mfa_secret is not None:
            user.encrypted_mfa_secret = new_encrypted_mfa_secret
        if (
            new_recovery_salt is not None
            and new_recovery_kdf_params is not None
            and new_encrypted_vault_key_recovery is not None
        ):
            user.recovery_salt = new_recovery_salt
            user.recovery_kdf_params = new_recovery_kdf_params
            user.encrypted_vault_key_recovery = new_encrypted_vault_key_recovery
            user.recovery_enabled = True
        self.db.commit()
        self.db.refresh(user)

        # Issue a fresh session at full assurance — the user has just proven
        # possession of the recovery key and signed a challenge.
        session = self.session_service.create_session(
            user,
            auth_level="full",
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return user, session, None
