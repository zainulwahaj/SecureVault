"""Vectors for the challenge-bound auth signature primitive."""

import base64
import pytest

nacl_signing = pytest.importorskip("nacl.signing")
from nacl.signing import SigningKey

from app.services.auth_crypto import verify_login_signature


def _b64(value: bytes) -> str:
    return base64.b64encode(value).decode("ascii")


def test_valid_signature_verifies():
    signing_key = SigningKey.generate()
    challenge = b"server-issued-challenge-bytes-32x"
    signature = signing_key.sign(challenge).signature
    assert verify_login_signature(
        public_key_b64=_b64(bytes(signing_key.verify_key)),
        challenge_b64=_b64(challenge),
        signature_b64=_b64(signature),
    )


def test_tampered_signature_rejected():
    signing_key = SigningKey.generate()
    challenge = b"another-challenge"
    sig = bytearray(signing_key.sign(challenge).signature)
    sig[0] ^= 0xFF
    assert not verify_login_signature(
        public_key_b64=_b64(bytes(signing_key.verify_key)),
        challenge_b64=_b64(challenge),
        signature_b64=_b64(bytes(sig)),
    )


def test_signature_from_different_key_rejected():
    challenge = b"yet-another-challenge"
    holder = SigningKey.generate()
    impostor = SigningKey.generate()
    signature = impostor.sign(challenge).signature
    assert not verify_login_signature(
        public_key_b64=_b64(bytes(holder.verify_key)),
        challenge_b64=_b64(challenge),
        signature_b64=_b64(signature),
    )


def test_invalid_inputs_return_false():
    assert not verify_login_signature("nope", "nope", "nope")
