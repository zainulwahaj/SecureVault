"""API Routers"""
from app.routers.auth import router as auth_router
from app.routers.files import router as files_router
from app.routers.sharing import router as sharing_router
from app.routers.mfa import router as mfa_router

__all__ = ["auth_router", "files_router", "sharing_router", "mfa_router"]
