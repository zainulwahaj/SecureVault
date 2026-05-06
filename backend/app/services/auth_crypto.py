"""
Challenge-bound authentication signature verification.

The browser owns an Ed25519 private key encrypted with the VaultKey.
The backend stores only the public key and verifies signatures over
short-lived login challenges.
"""

from base64 import b64decode


def verify_login_signature(public_key_b64: str, challenge_b64: str, signature_b64: str) -> bool:
    """Return True when signature signs challenge with the stored public key."""
    try:
        from nacl.exceptions import BadSignatureError
        from nacl.signing import VerifyKey
    except ImportError:
        return False

    try:
        public_key = b64decode(public_key_b64, validate=True)
        challenge = b64decode(challenge_b64, validate=True)
        signature = b64decode(signature_b64, validate=True)
        VerifyKey(public_key).verify(challenge, signature)
        return True
    except (ValueError, BadSignatureError):
        return False
