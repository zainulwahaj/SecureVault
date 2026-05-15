"""Health Router — readiness, liveness, and operational probes."""

import os
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import text
from redis import Redis

from app.database import get_db
from app.services.session import get_redis
from app.config import get_settings
from app.services.observability import metrics

router = APIRouter(prefix="/health", tags=["health"])
settings = get_settings()


@router.get("/")
async def liveness():
    """Basic liveness check — the process is running."""
    return {"status": "ok"}


@router.get("/ready")
async def readiness(db: DBSession = Depends(get_db)):
    """
    Checks that PostgreSQL, Redis, and encrypted blob storage are reachable.
    Returns 503 if any required dependency is down.
    """
    checks = {"postgres": False, "redis": False, "storage": False}

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

    try:
        checks["storage"] = _check_storage_writable()
    except Exception:
        pass

    all_healthy = all(checks.values())
    payload = {
        "status": "ok" if all_healthy else "degraded",
        "checks": checks,
    }
    return JSONResponse(status_code=200 if all_healthy else 503, content=payload)


@router.get("/info")
async def info():
    """Non-sensitive application metadata."""
    return {
        "app": settings.APP_NAME,
        "version": "2.0.0",
        "security": "zero-knowledge",
    }


@router.get("/metrics")
async def operational_metrics(x_metrics_token: str | None = Header(default=None)):
    """Return in-process request metrics when explicitly enabled."""
    if not settings.METRICS_ENABLED:
        raise HTTPException(status_code=404, detail="Metrics disabled")
    if not settings.METRICS_TOKEN:
        raise HTTPException(status_code=503, detail="Metrics token not configured")
    if x_metrics_token != settings.METRICS_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid metrics token")
    return metrics.snapshot()


def _check_storage_writable() -> bool:
    storage_dir = Path(settings.STORAGE_DIR)
    storage_dir.mkdir(parents=True, exist_ok=True)
    fd, path = tempfile.mkstemp(prefix=".health-", dir=storage_dir)
    try:
        os.write(fd, b"ok")
        return True
    finally:
        os.close(fd)
        try:
            os.unlink(path)
        except FileNotFoundError:
            pass
