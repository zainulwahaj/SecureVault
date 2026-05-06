"""API Routers"""
from app.routers.auth import router as auth_router
from app.routers.files import router as files_router
from app.routers.sharing import router as sharing_router
from app.routers.mfa import router as mfa_router
from app.routers.folders import router as folders_router
from app.routers.health import router as health_router
from app.routers.audit import router as audit_router
from app.routers.links import router as links_router

__all__ = [
    "auth_router",
    "files_router",
    "sharing_router",
    "mfa_router",
    "folders_router",
    "health_router",
    "audit_router",
    "links_router",
]
