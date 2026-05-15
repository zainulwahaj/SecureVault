"""Recovery-service round-trip test.

Uses an in-memory dict-backed Redis stub so we don't require a live Redis
during unit tests.
"""

import base64
import pytest

nacl = pytest.importorskip("nacl.signing")
from nacl.signing import SigningKey

from app.services.recovery import RecoveryService
from app.services.session import set_redis


class _FakeRedis:
    def __init__(self):
        self.store: dict[str, str] = {}

    def setex(self, key: str, ttl: int, value: str) -> None:
        self.store[key] = value

    def get(self, key: str):
        return self.store.get(key)

    def delete(self, key: str) -> None:
        self.store.pop(key, None)

    # Not used by RecoveryService, but SessionService.create_session calls these.
    def hset(self, *a, **k): return None
    def expire(self, *a, **k): return None
    def sadd(self, *a, **k): return None
    def srem(self, *a, **k): return None
    def smembers(self, *a, **k): return set()
    def hgetall(self, *a, **k): return {}
    def hget(self, *a, **k): return None
    def hdel(self, *a, **k): return None


@pytest.fixture(autouse=True)
def _stub_redis():
    set_redis(_FakeRedis())
    yield
    set_redis(None)


def _b64(b: bytes) -> str:
    return base64.b64encode(b).decode("ascii")


def test_enable_then_challenge_then_reset(db_session, fake_user):
    signing_key = SigningKey.generate()
    fake_user.auth_public_key = _b64(bytes(signing_key.verify_key))
    fake_user.encrypted_auth_private_key = {"ciphertext": "x", "algorithm": "xchacha20-poly1305", "version": 1}
    db_session.commit()

    svc = RecoveryService(db_session)
    svc.enable_recovery(
        user=fake_user,
        recovery_salt="c2FsdC1iYXNlNjQ=",
        recovery_kdf_params={"algorithm": "pbkdf2-sha256", "iterations": 250000, "keyLength": 32, "version": 1},
        encrypted_vault_key_recovery={"ciphertext": "wrapped", "algorithm": "xchacha20-poly1305", "version": 1},
    )
    assert fake_user.recovery_enabled is True

    challenge, error = svc.get_recovery_challenge(fake_user.email)
    assert error is None
    assert challenge is not None
    challenge_b64 = challenge["recoveryChallenge"]
    challenge_bytes = base64.b64decode(challenge_b64)

    signature = signing_key.sign(challenge_bytes).signature

    user, session, err = svc.reset_password(
        email=fake_user.email,
        challenge_id=challenge["recoveryChallengeId"],
        signature=_b64(signature),
        new_salt="bmV3LXNhbHQ=",
        new_kdf_params={"algorithm": "pbkdf2-sha256", "iterations": 100000, "keyLength": 32, "version": 1},
        new_encrypted_vault_key={"ciphertext": "new-wrap", "algorithm": "xchacha20-poly1305", "version": 1},
        new_login_proof="b" * 64,
        new_encrypted_auth_private_key={"ciphertext": "still-the-same", "algorithm": "xchacha20-poly1305", "version": 1},
    )
    assert err is None
    assert user is not None
    assert session is not None
    assert user.login_proof == "b" * 64
    assert user.encrypted_vault_key["ciphertext"] == "new-wrap"


def test_reset_rejects_bad_signature(db_session, fake_user):
    signing_key = SigningKey.generate()
    fake_user.auth_public_key = _b64(bytes(signing_key.verify_key))
    db_session.commit()

    svc = RecoveryService(db_session)
    svc.enable_recovery(
        user=fake_user,
        recovery_salt="c2FsdA==",
        recovery_kdf_params={"algorithm": "pbkdf2-sha256", "iterations": 250000, "keyLength": 32, "version": 1},
        encrypted_vault_key_recovery={"ciphertext": "wrapped", "algorithm": "xchacha20-poly1305", "version": 1},
    )
    challenge, _ = svc.get_recovery_challenge(fake_user.email)
    assert challenge is not None

    user, session, err = svc.reset_password(
        email=fake_user.email,
        challenge_id=challenge["recoveryChallengeId"],
        signature=_b64(b"\x00" * 64),
        new_salt="bmV3LXNhbHQ=",
        new_kdf_params={"algorithm": "pbkdf2-sha256", "iterations": 100000, "keyLength": 32, "version": 1},
        new_encrypted_vault_key={"ciphertext": "x", "algorithm": "xchacha20-poly1305", "version": 1},
        new_login_proof="0" * 64,
        new_encrypted_auth_private_key={"ciphertext": "x", "algorithm": "xchacha20-poly1305", "version": 1},
    )
    assert user is None
    assert session is None
    assert err is not None


def test_disabled_recovery_rejects_challenge(db_session, fake_user):
    svc = RecoveryService(db_session)
    challenge, error = svc.get_recovery_challenge(fake_user.email)
    assert challenge is None
    assert error is not None
