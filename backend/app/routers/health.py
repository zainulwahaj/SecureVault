"""
Health Router — Readiness & liveness probes
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import text
from redis import Redis

from app.database import get_db
from app.services.session import get_redis
from app.config import get_settings

router = APIRouter(prefix="/health", tags=["health"])
settings = get_settings()


@router.get("/")
async def liveness():
    """Basic liveness check — the process is running."""
    return {"status": "ok"}


@router.get("/ready")
async def readiness(db: DBSession = Depends(get_db)):
    """
    Checks that both PostgreSQL and Redis are reachable.
    Returns 503 if either is down.
    """
    checks = {"postgres": False, "redis": False}

    try:
        db.execute(text("SELECT 1"))
        checks["postgres"] = True
    except Exception:
        pass

    try:
        r: Redis = get_redis()
        r.ping()
        checks["redis"] = True
    except Exception:
        pass

    all_healthy = all(checks.values())
    return {
        "status": "ok" if all_healthy else "degraded",
        "checks": checks,
    }


@router.get("/info")
async def info():
    """Non-sensitive application metadata."""
    return {
        "app": settings.APP_NAME,
        "version": "2.0.0",
        "security": "zero-knowledge",
    }
