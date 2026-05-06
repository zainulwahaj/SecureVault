"""
Application Configuration

SECURITY NOTE:
- SECRET_KEY must be a strong random value in production
- Generate with: python -c "import secrets; print(secrets.token_urlsafe(64))"
"""

from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Union, List


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    # Application
    APP_NAME: str = "Secure Vault"
    DEBUG: bool = False

    # Database (PostgreSQL)
    DATABASE_URL: str = "postgresql://vault:vault@localhost:5432/vaultdb"

    # Redis (sessions + cache)
    REDIS_URL: str = "redis://localhost:6379/0"

    # Session Configuration
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    SESSION_COOKIE_NAME: str = "vault_session"
    SESSION_EXPIRE_HOURS: int = 24

    # CORS
    CORS_ORIGINS: Union[List[str], str] = ["http://localhost:8080"]

    # File Storage (local volume mount)
    STORAGE_DIR: str = "storage"

    # Maximum file size in bytes (100 MB)
    MAX_FILE_SIZE: int = 100 * 1024 * 1024

    # Trash bin retention (days)
    TRASH_RETENTION_DAYS: int = 30

    # Max file versions to keep per file
    MAX_FILE_VERSIONS: int = 10

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()
