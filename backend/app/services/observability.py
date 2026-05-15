"""Operational observability primitives.

The module intentionally avoids request bodies, query strings, cookies, and
other user data. Logs and metrics should help operate the service without
weakening the zero-knowledge model.
"""

import hashlib
import json
import logging
import time
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from threading import Lock
from typing import Any, DefaultDict, Dict, Tuple

from fastapi import Request, Response

from app.config import get_settings
from app.services.request_context import (
    client_ip_var,
    request_id_var,
    session_hash_var,
    user_agent_var,
)


settings = get_settings()
logger = logging.getLogger("securevault.access")


class JsonFormatter(logging.Formatter):
    """Minimal JSON formatter for container-friendly logs."""

    converter = time.gmtime

    def format(self, record: logging.LogRecord) -> str:
        payload: Dict[str, Any] = {
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%SZ"),
            "level": record.levelname.lower(),
            "logger": record.name,
            "message": record.getMessage(),
        }
        extra = getattr(record, "structured", None)
        if isinstance(extra, dict):
            payload.update(extra)
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, sort_keys=True, separators=(",", ":"))


def configure_logging(debug: bool = False) -> None:
    """Configure app logging once for local and container runtimes."""
    root = logging.getLogger()
    if getattr(root, "_securevault_logging_configured", False):
        return

    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root.handlers = [handler]
    root.setLevel(logging.DEBUG if debug else logging.INFO)
    setattr(root, "_securevault_logging_configured", True)


def get_client_ip(request: Request) -> str:
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()[:45]
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()[:45]
    return request.client.host if request.client else "unknown"


def _valid_request_id(value: str | None) -> str:
    if not value:
        return str(uuid.uuid4())
    value = value.strip()
    if 1 <= len(value) <= 128 and all(31 < ord(ch) < 127 for ch in value):
        return value
    return str(uuid.uuid4())


def hash_session_token(token: str | None) -> str | None:
    if not token:
        return None
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


@dataclass
class RequestMetrics:
    """Small in-process metrics registry for health/ops probes."""

    started_at: float = field(default_factory=time.time)
    total_requests: int = 0
    status_counts: DefaultDict[str, int] = field(default_factory=lambda: defaultdict(int))
    route_counts: DefaultDict[Tuple[str, str, str], int] = field(default_factory=lambda: defaultdict(int))
    route_latency_ms: DefaultDict[Tuple[str, str, str], float] = field(default_factory=lambda: defaultdict(float))
    lock: Lock = field(default_factory=Lock)

    def record(self, method: str, route: str, status_code: int, duration_ms: float) -> None:
        status_class = f"{status_code // 100}xx"
        key = (method, route, status_class)
        with self.lock:
            self.total_requests += 1
            self.status_counts[status_class] += 1
            self.route_counts[key] += 1
            self.route_latency_ms[key] += duration_ms

    def snapshot(self) -> Dict[str, Any]:
        with self.lock:
            routes = []
            for key, count in self.route_counts.items():
                method, route, status_class = key
                total_latency = self.route_latency_ms[key]
                routes.append({
                    "method": method,
                    "route": route,
                    "statusClass": status_class,
                    "count": count,
                    "avgLatencyMs": round(total_latency / count, 2) if count else 0,
                })
            return {
                "uptimeSeconds": int(time.time() - self.started_at),
                "totalRequests": self.total_requests,
                "statusCounts": dict(self.status_counts),
                "routes": sorted(routes, key=lambda row: (row["route"], row["method"], row["statusClass"])),
            }


metrics = RequestMetrics()


async def observability_middleware(request: Request, call_next) -> Response:
    request_id = _valid_request_id(request.headers.get("x-request-id"))
    client_ip = get_client_ip(request)
    user_agent = (request.headers.get("user-agent") or "")[:512] or None
    session_hash = hash_session_token(request.cookies.get(settings.SESSION_COOKIE_NAME))

    tokens = [
        request_id_var.set(request_id),
        client_ip_var.set(client_ip),
        user_agent_var.set(user_agent),
        session_hash_var.set(session_hash),
    ]

    start = time.perf_counter()
    status_code = 500
    route = request.url.path
    response: Response | None = None
    try:
        response = await call_next(request)
        status_code = response.status_code
        return response
    except Exception:
        duration_ms = (time.perf_counter() - start) * 1000
        route_template = _route_template(request, route)
        metrics.record(request.method, route_template, status_code, duration_ms)
        logger.exception(
            "request_failed",
            extra={
                "structured": {
                    "event": "http.request",
                    "request_id": request_id,
                    "method": request.method,
                    "route": route_template,
                    "status_code": status_code,
                    "duration_ms": round(duration_ms, 2),
                    "client_ip": client_ip,
                }
            },
        )
        raise
    finally:
        duration_ms = (time.perf_counter() - start) * 1000
        route_template = _route_template(request, route)
        if response is not None:
            response.headers["X-Request-ID"] = request_id
            metrics.record(request.method, route_template, status_code, duration_ms)
            if settings.REQUEST_LOGGING_ENABLED:
                logger.info(
                    "request_completed",
                    extra={
                        "structured": {
                            "event": "http.request",
                            "request_id": request_id,
                            "method": request.method,
                            "route": route_template,
                            "status_code": status_code,
                            "duration_ms": round(duration_ms, 2),
                            "client_ip": client_ip,
                        }
                    },
                )
        for token in reversed(tokens):
            token.var.reset(token)


def _route_template(request: Request, fallback: str) -> str:
    route = request.scope.get("route")
    return getattr(route, "path", fallback)
