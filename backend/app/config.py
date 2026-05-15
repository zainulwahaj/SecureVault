"""
Application Configuration

SECURITY NOTE:
- SECRET_KEY must be a strong random value in production
- Generate with: python -c "import secrets; print(secrets.token_urlsafe(64))"
"""

from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional, Union, List


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    # Application
    APP_NAME: str = "Secure Vault"
    DEBUG: bool = False
    ENVIRONMENT: str = "development"

    # Database (PostgreSQL)
    DATABASE_URL: str = "postgresql://vault:vault@localhost:5432/vaultdb"

    # Redis (sessions + cache)
    REDIS_URL: str = "redis://localhost:6379/0"

    # Session Configuration
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    SESSION_COOKIE_NAME: str = "vault_session"
    SESSION_EXPIRE_HOURS: int = 24
    SESSION_COOKIE_SECURE: bool = False

    # Login abuse controls
    LOGIN_RATE_LIMIT_WINDOW_SECONDS: int = 10 * 60
    LOGIN_RATE_LIMIT_EMAIL_ATTEMPTS: int = 10
    LOGIN_RATE_LIMIT_IP_ATTEMPTS: int = 30

    # CORS
    CORS_ORIGINS: Union[List[str], str] = ["http://localhost:8080"]

    # File Storage (local volume mount)
    STORAGE_DIR: str = "storage"

    # Maximum file size in bytes (100 MB)
    MAX_FILE_SIZE: int = 100 * 1024 * 1024

    # Per-user stored encrypted bytes, including trash and retained versions
    MAX_STORAGE_BYTES: int = 10 * 1024 * 1024 * 1024

    # Per-user active file count limit
    MAX_FILE_COUNT: int = 10000

    # Trash bin retention (days)
    TRASH_RETENTION_DAYS: int = 30

    # Max file versions to keep per file
    MAX_FILE_VERSIONS: int = 10

    # Audit hash-chain secret. In production this should be a separately
    # rotated secret from SECRET_KEY so audit integrity has an independent root.
    AUDIT_HASH_SECRET: Optional[str] = None

    # Structured request logging and operational metrics
    REQUEST_LOGGING_ENABLED: bool = True
    METRICS_ENABLED: bool = False
    METRICS_TOKEN: Optional[str] = None

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()
