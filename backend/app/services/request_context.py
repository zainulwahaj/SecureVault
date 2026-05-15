"""Request-scoped metadata used by logging and audit services."""

from contextvars import ContextVar
from typing import Optional


request_id_var: ContextVar[Optional[str]] = ContextVar("request_id", default=None)
client_ip_var: ContextVar[Optional[str]] = ContextVar("client_ip", default=None)
user_agent_var: ContextVar[Optional[str]] = ContextVar("user_agent", default=None)
session_hash_var: ContextVar[Optional[str]] = ContextVar("session_hash", default=None)


def get_request_id() -> Optional[str]:
    return request_id_var.get()


def get_client_ip() -> Optional[str]:
    return client_ip_var.get()


def get_user_agent() -> Optional[str]:
    return user_agent_var.get()


def get_session_hash() -> Optional[str]:
    return session_hash_var.get()
