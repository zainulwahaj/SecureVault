"""CSRF protection for cookie-authenticated unsafe requests."""

import json
from typing import Optional

from fastapi import Request
from fastapi.responses import JSONResponse, Response

from app.config import get_settings
from app.services.session import SESSION_PREFIX, get_redis


settings = get_settings()
UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
CSRF_HEADER = "x-csrf-token"

# Login/register create sessions before a CSRF token exists. Authenticated
# mutations and public-link operations with an existing session are protected.
CSRF_EXEMPT_PATHS = {
    "/api/auth/register",
    "/api/auth/login/challenge",
    "/api/auth/login/verify",
}


async def csrf_middleware(request: Request, call_next) -> Response:
    if request.method.upper() in UNSAFE_METHODS and request.url.path not in CSRF_EXEMPT_PATHS:
        session_token = request.cookies.get(settings.SESSION_COOKIE_NAME)
        if session_token and _session_exists(session_token):
            csrf_token = request.headers.get(CSRF_HEADER)
            if not _valid_csrf(session_token, csrf_token):
                return JSONResponse(status_code=403, content={"detail": "Invalid CSRF token"})
    return await call_next(request)


def _session_exists(session_token: str) -> bool:
    return get_redis().exists(f"{SESSION_PREFIX}{session_token}") > 0


def _valid_csrf(session_token: str, csrf_token: Optional[str]) -> bool:
    if not csrf_token:
        return False
    raw = get_redis().get(f"{SESSION_PREFIX}{session_token}")
    if raw is None:
        return False
    expected = json.loads(raw).get("csrf_token")
    if not expected:
        return False
    import secrets

    return secrets.compare_digest(expected, csrf_token)
