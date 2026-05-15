"""Permission boundary tests.

Checks that the data-access helpers refuse to leak files across users and
that soft-deleted files are hidden from get_file_by_id.
"""

from datetime import datetime

from app.models.user import User
from app.models.file import File
from app.services.file import FileService


def _make_user(db, email: str) -> User:
    user = User(
        email=email,
        salt="0" * 44,
        kdf_params={"algorithm": "pbkdf2-sha256", "iterations": 100000, "keyLength": 32, "version": 1},
        encrypted_vault_key={"ciphertext": "x", "algorithm": "xchacha20-poly1305", "version": 1},
        login_proof="a" * 64,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _make_file(db, owner: User, file_id: str = "f1", deleted: bool = False) -> File:
    f = File(
        id=file_id,
        user_id=owner.id,
        encrypted_file_key={"ciphertext": "x", "algorithm": "xchacha20-poly1305", "version": 1},
        encrypted_filename={"ciphertext": "x", "algorithm": "xchacha20-poly1305", "version": 1},
        storage_path=f"{owner.id}/{file_id}",
        encrypted_size=10,
        deleted_at=datetime.utcnow() if deleted else None,
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


def test_owner_can_fetch_their_file(db_session):
    owner = _make_user(db_session, "owner@example.com")
    file = _make_file(db_session, owner, "owned")
    fetched = FileService(db_session).get_file_by_id(file.id, owner.id)
    assert fetched is not None
    assert fetched.id == file.id


def test_other_user_cannot_fetch_someone_elses_file(db_session):
    owner = _make_user(db_session, "owner2@example.com")
    other = _make_user(db_session, "other@example.com")
    file = _make_file(db_session, owner, "owned2")
    fetched = FileService(db_session).get_file_by_id(file.id, other.id)
    assert fetched is None


def test_soft_deleted_file_is_invisible_to_normal_fetch(db_session):
    owner = _make_user(db_session, "owner3@example.com")
    file = _make_file(db_session, owner, "trashed", deleted=True)
    fetched = FileService(db_session).get_file_by_id(file.id, owner.id)
    assert fetched is None
