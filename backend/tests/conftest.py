"""Pytest fixtures for backend tests.

Provides an in-memory SQLite session bound to all ORM models so service-level
tests run without Postgres or Redis. Redis-backed code paths (sessions, login
challenges) are exercised separately with stub clients.
"""

import os
import sys
import pytest
from pathlib import Path

# Ensure `app` is importable regardless of where pytest is invoked from.
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# Keep config defaults predictable in tests.
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/15")
os.environ.setdefault("SECRET_KEY", "test-secret")


from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
import app.models  # noqa: F401 — ensure all tables register


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture()
def fake_user(db_session):
    """Insert a minimal User row that other tests can attach state to."""
    from app.models.user import User
    user = User(
        email="tester@example.com",
        salt="0" * 44,
        kdf_params={"algorithm": "pbkdf2-sha256", "iterations": 100000, "keyLength": 32, "version": 1},
        encrypted_vault_key={"ciphertext": "x", "algorithm": "xchacha20-poly1305", "version": 1},
        login_proof="a" * 64,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user
