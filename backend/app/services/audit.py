"""
Audit Service — Activity logging

Logs user actions for the audit/activity-log view.
The logged details may include resource IDs but never plaintext
filenames (zero-knowledge principle).
"""

import hashlib
import hmac
import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional, List
from sqlalchemy.orm import Session as DBSession
from app.models.audit_log import AuditLog
from app.models.user import User
from app.config import get_settings
from app.services.request_context import (
    get_client_ip,
    get_request_id,
    get_session_hash,
    get_user_agent,
)


settings = get_settings()

DETAIL_DENYLIST = (
    "ciphertext",
    "password",
    "secret",
    "token",
    "private",
    "signature",
    "proof",
    "salt",
    "recovery",
)

DETAIL_ALLOWLIST = (
    "fingerprint",
    "public_key_fingerprint",
)


class AuditService:
    """Writes and reads audit log entries."""

    def __init__(self, db: DBSession):
        self.db = db

    def log(
        self,
        user_id: str,
        action: str,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        details: Optional[dict] = None,
        category: str = "application",
        outcome: str = "success",
        severity: str = "info",
        request_id: Optional[str] = None,
        session_id_hash: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> AuditLog:
        """Create an audit log entry."""
        self._lock_user_audit_cursor(user_id)
        now = datetime.utcnow()
        previous = self._latest_user_event(user_id)
        prev_hash = previous.event_hash if previous else None
        sequence_number = (previous.sequence_number or 0) + 1 if previous else 1
        sanitized_details = sanitize_details(details) if details else None
        canonical_action = normalize_action(action)

        entry = AuditLog(
            id=str(uuid.uuid4()),
            user_id=user_id,
            action=canonical_action,
            category=category,
            outcome=outcome,
            severity=severity,
            resource_type=resource_type,
            resource_id=resource_id,
            details=sanitized_details,
            request_id=request_id or get_request_id(),
            session_id_hash=session_id_hash or get_session_hash(),
            ip_address=ip_address or get_client_ip(),
            user_agent=user_agent or get_user_agent(),
            sequence_number=sequence_number,
            prev_hash=prev_hash,
            hash_version="hmac-sha256-v1",
            created_at=now,
        )
        entry.event_hash = compute_event_hash(entry)
        self.db.add(entry)
        self.db.commit()
        self.db.refresh(entry)
        return entry

    def list_activity(
        self,
        user_id: str,
        action: Optional[str] = None,
        resource_type: Optional[str] = None,
        outcome: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[AuditLog]:
        """List audit entries for a user with optional filters."""
        q = self.db.query(AuditLog).filter(AuditLog.user_id == user_id)
        if action:
            q = q.filter(AuditLog.action == normalize_action(action))
        if resource_type:
            q = q.filter(AuditLog.resource_type == resource_type)
        if outcome:
            q = q.filter(AuditLog.outcome == outcome)
        return (
            q.order_by(AuditLog.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

    def count_activity(
        self,
        user_id: str,
        action: Optional[str] = None,
        resource_type: Optional[str] = None,
        outcome: Optional[str] = None,
    ) -> int:
        """Count audit entries (for pagination)."""
        q = self.db.query(AuditLog).filter(AuditLog.user_id == user_id)
        if action:
            q = q.filter(AuditLog.action == normalize_action(action))
        if resource_type:
            q = q.filter(AuditLog.resource_type == resource_type)
        if outcome:
            q = q.filter(AuditLog.outcome == outcome)
        return q.count()

    def cleanup_old_logs(self, days: int = 90) -> int:
        """Delete old legacy entries without breaking sealed audit chains."""
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        count = (
            self.db.query(AuditLog)
            .filter(AuditLog.created_at < cutoff)
            .filter(AuditLog.event_hash.is_(None))
            .delete(synchronize_session=False)
        )
        self.db.commit()
        return count

    def verify_user_chain(self, user_id: str) -> dict:
        """Verify the per-user audit hash chain."""
        entries = (
            self.db.query(AuditLog)
            .filter(AuditLog.user_id == user_id)
            .filter(AuditLog.event_hash.isnot(None))
            .order_by(AuditLog.sequence_number.asc())
            .all()
        )
        previous_hash = None
        for entry in entries:
            if entry.prev_hash != previous_hash:
                return {
                    "valid": False,
                    "checkedCount": len(entries),
                    "failedEntryId": entry.id,
                    "reason": "previous_hash_mismatch",
                }
            expected_hash = compute_event_hash(entry)
            if entry.event_hash != expected_hash:
                return {
                    "valid": False,
                    "checkedCount": len(entries),
                    "failedEntryId": entry.id,
                    "reason": "event_hash_mismatch",
                }
            previous_hash = entry.event_hash
        return {
            "valid": True,
            "checkedCount": len(entries),
            "failedEntryId": None,
            "reason": None,
        }

    def _latest_user_event(self, user_id: str) -> Optional[AuditLog]:
        return (
            self.db.query(AuditLog)
            .filter(AuditLog.user_id == user_id)
            .filter(AuditLog.event_hash.isnot(None))
            .order_by(AuditLog.sequence_number.desc())
            .with_for_update()
            .first()
        )

    def _lock_user_audit_cursor(self, user_id: str) -> None:
        """Serialize sealed audit writes for one user within this transaction."""
        self.db.query(User.id).filter(User.id == user_id).with_for_update().first()


def normalize_action(action: str) -> str:
    """Normalize historical underscore actions into dotted event names."""
    return action.replace("_", ".")


def sanitize_details(value: Any) -> Any:
    """Remove sensitive fields before details enter audit storage."""
    if isinstance(value, dict):
        sanitized = {}
        for key, child in value.items():
            key_lower = str(key).lower()
            allowed = any(allowed in key_lower for allowed in DETAIL_ALLOWLIST)
            denied = any(denied in key_lower for denied in DETAIL_DENYLIST)
            if denied and not allowed:
                sanitized[key] = "[redacted]"
            else:
                sanitized[key] = sanitize_details(child)
        return sanitized
    if isinstance(value, list):
        return [sanitize_details(item) for item in value]
    return value


def compute_event_hash(entry: AuditLog) -> str:
    """Compute a deterministic HMAC over the audit event."""
    secret = settings.AUDIT_HASH_SECRET or settings.SECRET_KEY
    payload = {
        "id": entry.id,
        "user_id": entry.user_id,
        "action": entry.action,
        "category": entry.category,
        "outcome": entry.outcome,
        "severity": entry.severity,
        "resource_type": entry.resource_type,
        "resource_id": entry.resource_id,
        "details": entry.details,
        "request_id": entry.request_id,
        "session_id_hash": entry.session_id_hash,
        "ip_address": entry.ip_address,
        "user_agent": entry.user_agent,
        "created_at": entry.created_at.isoformat() if entry.created_at else None,
        "sequence_number": entry.sequence_number,
        "prev_hash": entry.prev_hash,
        "hash_version": entry.hash_version,
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str).encode("utf-8")
    return hmac.new(secret.encode("utf-8"), encoded, hashlib.sha256).hexdigest()
