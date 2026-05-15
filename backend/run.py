#!/usr/bin/env python3
"""
Development server runner for the Vault backend.

Usage:
    python run.py

Or with uvicorn directly:
    uvicorn app.main:app --reload --port 8000
"""

from pathlib import Path

import uvicorn
from alembic import command
from alembic.config import Config


def run_migrations() -> None:
    backend_root = Path(__file__).resolve().parent
    cfg = Config(str(backend_root / "alembic.ini"))
    command.upgrade(cfg, "head")

if __name__ == "__main__":
    run_migrations()
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,  # Enable auto-reload for development
    )
