"""
Database Configuration and Session Management

Supports:
- SQLite for local development
- PostgreSQL for AWS production (RDS)
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import get_settings

settings = get_settings()

# Get database URL (handles AWS Secrets Manager lookup)
database_url = settings.get_database_url()

# Create engine with appropriate settings for SQLite vs PostgreSQL
engine_kwargs = {}

if "sqlite" in database_url:
    # SQLite specific settings
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    # PostgreSQL settings for Lambda
    engine_kwargs["pool_pre_ping"] = True  # Verify connections before use
    engine_kwargs["pool_size"] = 5
    engine_kwargs["max_overflow"] = 10
    engine_kwargs["pool_recycle"] = 300  # Recycle connections every 5 minutes

engine = create_engine(database_url, **engine_kwargs)

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()


def get_db():
    """
    Dependency that provides a database session.
    Ensures session is closed after request.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initialize database tables"""
    Base.metadata.create_all(bind=engine)
