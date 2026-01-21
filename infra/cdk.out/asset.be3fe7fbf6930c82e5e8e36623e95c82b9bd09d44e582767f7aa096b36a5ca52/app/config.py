"""
Application Configuration

SECURITY NOTE:
- SECRET_KEY must be changed in production
- These settings are for local development only

Supports both local development and AWS Lambda deployment.
"""

import os
import json
from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional


def get_secret_from_aws(secret_arn: str) -> dict:
    """Fetch secret from AWS Secrets Manager"""
    import boto3
    client = boto3.client('secretsmanager')
    response = client.get_secret_value(SecretId=secret_arn)
    return json.loads(response['SecretString'])


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    
    # Application
    APP_NAME: str = "Secure Vault"
    DEBUG: bool = True
    
    # Database
    # Local: sqlite:///./vault.db
    # AWS: Built from secrets manager
    DATABASE_URL: str = "sqlite:///./vault.db"
    
    # AWS-specific database config (for Lambda)
    DB_SECRET_ARN: Optional[str] = None
    DATABASE_HOST: Optional[str] = None
    DATABASE_NAME: str = "vaultdb"
    
    # Session Configuration
    # SECURITY: In production, use a strong random key
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    SECRET_KEY_ARN: Optional[str] = None
    SESSION_COOKIE_NAME: str = "vault_session"
    SESSION_EXPIRE_HOURS: int = 24
    
    # CORS (for local development)
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]
    
    # File Storage
    # Local: Directory where encrypted files are stored
    UPLOAD_DIR: str = "uploads"
    # AWS S3: Bucket name for file storage
    S3_BUCKET_NAME: Optional[str] = None
    # Toggle between local and S3 storage
    USE_S3_STORAGE: bool = False
    
    # Maximum file size in bytes (100 MB)
    MAX_FILE_SIZE: int = 100 * 1024 * 1024
    
    # AWS Region (for S3)
    AWS_REGION: str = "us-east-1"
    
    class Config:
        env_file = ".env"
        extra = "ignore"
    
    @property
    def is_lambda(self) -> bool:
        """Check if running in AWS Lambda"""
        return "AWS_LAMBDA_FUNCTION_NAME" in os.environ
    
    @property
    def is_postgres(self) -> bool:
        """Check if using PostgreSQL"""
        return self.DATABASE_URL.startswith("postgresql") or self.DB_SECRET_ARN is not None
    
    def get_database_url(self) -> str:
        """Get database URL, fetching from Secrets Manager if in Lambda"""
        if self.DB_SECRET_ARN and self.DATABASE_HOST:
            try:
                secret = get_secret_from_aws(self.DB_SECRET_ARN)
                username = secret.get('username', 'vaultadmin')
                password = secret.get('password')
                return f"postgresql://{username}:{password}@{self.DATABASE_HOST}:5432/{self.DATABASE_NAME}"
            except Exception as e:
                print(f"Failed to get DB secret: {e}")
                return self.DATABASE_URL
        return self.DATABASE_URL
    
    def get_secret_key(self) -> str:
        """Get secret key, fetching from Secrets Manager if in Lambda"""
        if self.SECRET_KEY_ARN:
            try:
                secret = get_secret_from_aws(self.SECRET_KEY_ARN)
                # The secret is stored as a simple string in generateSecretString
                if isinstance(secret, dict):
                    return secret.get('password', self.SECRET_KEY)
                return str(secret)
            except Exception as e:
                print(f"Failed to get app secret: {e}")
                return self.SECRET_KEY
        return self.SECRET_KEY


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()
