"""End-to-end tests for the strong-revocation envelope rotation logic.

Exercises SharingService.rotate_file_envelopes against an in-memory DB to
verify:
- recipients re-wrapped under the new key get a bumped key_version
- recipients omitted from the rotation payload are revoked
- public links on the file are deactivated
- mismatched fingerprints abort the rotation
- envelopes targeting non-active recipients are rejected
"""

from datetime import datetime

import pytest

from app.models.user import User
from app.models.file import File
from app.models.shared_file import SharedFile
from app.models.share_envelope import ShareEnvelope
from app.models.shared_link import SharedLink
from app.models.user_key import UserKey
from app.models.device_key import DeviceKey
from app.services.sharing import SharingService


def _make_user(db, email: str) -> User:
    user = User(
        email=email,
        salt="0" * 44,
        kdf_params={"algorithm": "pbkdf2-sha256", "iterations": 100000, "keyLength": 32, "version": 1},
        encrypted_vault_key={"ciphertext": "x", "algorithm": "xchacha20-poly1305", "version": 1},
        login_proof="a" * 64,
        public_key="dGVzdC1wdWJsaWMta2V5",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _make_file(db, owner: User, file_id: str = "file-1") -> File:
    f = File(
        id=file_id,
        user_id=owner.id,
        encrypted_file_key={"ciphertext": "old", "algorithm": "xchacha20-poly1305", "version": 1},
        encrypted_filename={"ciphertext": "x", "algorithm": "xchacha20-poly1305", "version": 1},
        encrypted_mime_type={"ciphertext": "x", "algorithm": "xchacha20-poly1305", "version": 1},
        storage_path=f"{owner.id}/{file_id}",
        encrypted_size=128,
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


def _register_recipient_keys(db, recipient: User, fingerprint: str = "AAAA:BBBB") -> tuple[UserKey, DeviceKey]:
    uk = UserKey(
        user_id=recipient.id,
        key_type="x25519-sharing",
        algorithm="x25519-sealed-box",
        public_key=recipient.public_key,
        fingerprint=fingerprint,
        version="1",
        is_active=True,
    )
    dk = DeviceKey(
        user_id=recipient.id,
        device_label="default",
        encryption_public_key=recipient.public_key,
        fingerprint=fingerprint,
        is_active=True,
    )
    db.add_all([uk, dk])
    db.commit()
    db.refresh(uk)
    db.refresh(dk)
    return uk, dk


def _create_share(db, file: File, owner: User, recipient: User, uk: UserKey, dk: DeviceKey) -> SharedFile:
    share = SharedFile(
        file_id=file.id,
        owner_id=owner.id,
        recipient_id=recipient.id,
        encrypted_file_key_for_recipient={"ciphertext": "old", "algorithm": "x25519-sealed-box", "version": 1},
        recipient_key_id=uk.id,
        permission="read",
    )
    db.add(share)
    db.flush()
    db.add(ShareEnvelope(
        share_id=share.id,
        recipient_device_key_id=dk.id,
        recipient_user_key_id=uk.id,
        encrypted_file_key={"ciphertext": "old-env", "algorithm": "x25519-sealed-box", "version": 1},
        key_version=1,
    ))
    db.commit()
    db.refresh(share)
    return share


def test_rotation_revokes_omitted_recipients_and_bumps_key_version(db_session):
    owner = _make_user(db_session, "owner@example.com")
    alice = _make_user(db_session, "alice@example.com")
    bob = _make_user(db_session, "bob@example.com")
    file = _make_file(db_session, owner)

    a_uk, a_dk = _register_recipient_keys(db_session, alice, fingerprint="ALICE:FINGERPRINT")
    b_uk, b_dk = _register_recipient_keys(db_session, bob, fingerprint="BOB:FINGERPRINT")
    _create_share(db_session, file, owner, alice, a_uk, a_dk)
    _create_share(db_session, file, owner, bob, b_uk, b_dk)

    # Active public link on this file — should be deactivated by rotation.
    link = SharedLink(
        file_id=file.id,
        owner_id=owner.id,
        token="t-rotate",
        encrypted_file_key={"ciphertext": "x", "algorithm": "x", "version": 1},
        encrypted_filename={"ciphertext": "x", "algorithm": "x", "version": 1},
    )
    db_session.add(link)
    db_session.commit()

    summary, error = SharingService(db_session).rotate_file_envelopes(
        file=file,
        owner=owner,
        recipient_envelopes=[
            {
                "recipientId": alice.id,
                "recipientPublicKeyFingerprint": "ALICE:FINGERPRINT",
                "encryptedFileKeyForRecipient": {
                    "ciphertext": "alice-new",
                    "algorithm": "x25519-sealed-box",
                    "version": 1,
                },
                "deviceEnvelopes": [],
            },
        ],
    )
    db_session.commit()
    assert error is None, error
    assert summary is not None
    assert len(summary["rotatedShareIds"]) == 1
    assert len(summary["revokedShareIds"]) == 1
    assert link.id in summary["revokedLinkIds"]

    db_session.refresh(link)
    assert link.is_active is False

    alice_share = db_session.query(SharedFile).filter(SharedFile.recipient_id == alice.id).one()
    bob_share = db_session.query(SharedFile).filter(SharedFile.recipient_id == bob.id).one()
    assert alice_share.revoked_at is None
    assert bob_share.revoked_at is not None

    # Alice gets a fresh envelope at key_version=2; old ones are revoked.
    alice_envelopes = db_session.query(ShareEnvelope).filter(ShareEnvelope.share_id == alice_share.id).all()
    versions = sorted({e.key_version for e in alice_envelopes})
    assert versions == [1, 2]
    new_envelopes = [e for e in alice_envelopes if e.key_version == 2]
    assert all(e.revoked_at is None for e in new_envelopes)
    old_envelopes = [e for e in alice_envelopes if e.key_version == 1]
    assert all(e.revoked_at is not None for e in old_envelopes)


def test_rotation_rejects_fingerprint_mismatch(db_session):
    owner = _make_user(db_session, "owner2@example.com")
    alice = _make_user(db_session, "alice2@example.com")
    file = _make_file(db_session, owner, file_id="file-2")
    a_uk, a_dk = _register_recipient_keys(db_session, alice, fingerprint="ALICE:CORRECT")
    _create_share(db_session, file, owner, alice, a_uk, a_dk)

    summary, error = SharingService(db_session).rotate_file_envelopes(
        file=file,
        owner=owner,
        recipient_envelopes=[
            {
                "recipientId": alice.id,
                "recipientPublicKeyFingerprint": "ALICE:WRONG",
                "encryptedFileKeyForRecipient": {"ciphertext": "x", "algorithm": "x", "version": 1},
            },
        ],
    )
    assert summary is None
    assert error and "fingerprint" in error.lower()


def test_rotation_rejects_envelopes_for_unknown_recipients(db_session):
    owner = _make_user(db_session, "owner3@example.com")
    alice = _make_user(db_session, "alice3@example.com")
    file = _make_file(db_session, owner, file_id="file-3")
    a_uk, a_dk = _register_recipient_keys(db_session, alice)
    _create_share(db_session, file, owner, alice, a_uk, a_dk)

    summary, error = SharingService(db_session).rotate_file_envelopes(
        file=file,
        owner=owner,
        recipient_envelopes=[
            {
                "recipientId": alice.id,
                "recipientPublicKeyFingerprint": "AAAA:BBBB",
                "encryptedFileKeyForRecipient": {"ciphertext": "ok", "algorithm": "x", "version": 1},
            },
            {
                "recipientId": "ghost-user-id",
                "recipientPublicKeyFingerprint": "x",
                "encryptedFileKeyForRecipient": {"ciphertext": "x", "algorithm": "x", "version": 1},
            },
        ],
    )
    assert summary is None
    assert error and "non-active" in error.lower()
