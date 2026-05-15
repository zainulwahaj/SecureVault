"""
FastAPI Main Application

Zero-Knowledge Secure File Vault — Backend API v2

SECURITY PRINCIPLES (enforced):
1. Backend is cryptographically blind
2. No plaintext passwords ever stored or processed
3. All encryption/decryption happens client-side
4. Sessions authorize requests but don't grant key access
"""

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from redis import Redis

from app.config import get_settings
from app.services.csrf import csrf_middleware
from app.services.observability import configure_logging, observability_middleware
from app.services.session import set_redis
from app.routers import (
    auth_router,
    files_router,
    sharing_router,
    mfa_router,
    folders_router,
    health_router,
    audit_router,
    links_router,
    recovery_router,
    webauthn_router,
)
# Ensure all models are imported so Alembic sees them
import app.models  # noqa: F401

settings = get_settings()
configure_logging(settings.DEBUG)

# ---------------------------------------------------------------------------
# Background task: trash auto-purge
# ---------------------------------------------------------------------------
_purge_task = None


async def _trash_purge_loop():
    """Periodically permanently delete files that have been trashed too long."""
    from app.database import SessionLocal
    from app.services.trash import TrashService

    while True:
        await asyncio.sleep(6 * 3600)  # every 6 hours
        try:
            db = SessionLocal()
            trash = TrashService(db)
            count = await trash.auto_purge()
            if count:
                print(f"[trash-purge] Permanently deleted {count} expired items")
            db.close()
        except Exception as e:
            print(f"[trash-purge] Error: {e}")


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    global _purge_task

    # --- Startup ---
    # Redis
    redis_client = Redis.from_url(settings.REDIS_URL, decode_responses=True)
    redis_client.ping()
    set_redis(redis_client)
    print("✓ Redis connected")

    print("✓ Database migrations managed by Alembic")

    # Background tasks
    _purge_task = asyncio.create_task(_trash_purge_loop())

    print(f"✓ {settings.APP_NAME} v2 backend started")
    print("=" * 50)
    print("SECURITY MODE: Zero-Knowledge Authentication")
    print("✓ Client-side crypto: PBKDF2 + XChaCha20-Poly1305")
    print("✓ Envelope encryption for file sharing")
    print("✓ Zero-knowledge MFA (TOTP)")
    print("=" * 50)

    yield

    # --- Shutdown ---
    if _purge_task:
        _purge_task.cancel()
    redis_client.close()
    print(f"✓ {settings.APP_NAME} backend stopped")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title=settings.APP_NAME,
    description="Zero-Knowledge Secure File Vault API — v2",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS
cors_origins = (
    settings.CORS_ORIGINS
    if isinstance(settings.CORS_ORIGINS, list)
    else [settings.CORS_ORIGINS] if settings.CORS_ORIGINS != "*" else ["*"]
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True if settings.CORS_ORIGINS != "*" else False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.middleware("http")(observability_middleware)
app.middleware("http")(csrf_middleware)

# Routers
app.include_router(auth_router, prefix="/api")
app.include_router(files_router, prefix="/api")
app.include_router(folders_router, prefix="/api")
app.include_router(sharing_router, prefix="/api")
app.include_router(links_router, prefix="/api")
app.include_router(mfa_router, prefix="/api")
app.include_router(audit_router, prefix="/api")
app.include_router(health_router, prefix="/api")
app.include_router(recovery_router, prefix="/api")
app.include_router(webauthn_router, prefix="/api")


@app.get("/")
async def root():
    return {
        "name": settings.APP_NAME,
        "version": "2.0.0",
        "status": "running",
    }
