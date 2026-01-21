"""
FastAPI Main Application

Zero-Knowledge Secure File Vault - Backend API

SECURITY PRINCIPLES (enforced):
1. Backend is cryptographically blind
2. No plaintext passwords ever stored or processed
3. All encryption/decryption happens client-side
4. Sessions authorize requests but don't grant key access
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import get_settings
from app.database import init_db
from app.routers import auth_router, files_router, sharing_router, mfa_router

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    # Startup: Initialize database
    init_db()
    print("✓ Database initialized")
    print(f"✓ {settings.APP_NAME} backend started")
    print("=" * 50)
    print("SECURITY MODE: Zero-Knowledge Authentication")
    print("✓ Passwords NEVER reach the backend")
    print("✓ Only encrypted blobs are stored")
    print("✓ Client-side crypto: PBKDF2 + XChaCha20-Poly1305")
    print("✓ Envelope encryption for file sharing")
    print("✓ Zero-knowledge MFA (TOTP)")
    print("=" * 50)
    yield
    # Shutdown
    print(f"✓ {settings.APP_NAME} backend stopped")


# Create FastAPI application
app = FastAPI(
    title=settings.APP_NAME,
    description="Zero-Knowledge Secure File Vault API",
    version="0.4.0",
    lifespan=lifespan,
)

# Configure CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,  # Required for cookies
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router, prefix="/api")
app.include_router(files_router, prefix="/api")
app.include_router(sharing_router, prefix="/api")
app.include_router(mfa_router, prefix="/api")


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "name": settings.APP_NAME,
        "status": "running",
        "phase": "7 - MFA Enforcement (Zero-Knowledge TOTP)",
    }


@app.get("/api/health")
async def health_check():
    """API health check"""
    return {"status": "healthy"}
