"""
Audit Service — Activity logging

Logs user actions for the audit/activity-log view.
The logged details may include resource IDs but never plaintext
filenames (zero-knowledge principle).
"""

from datetime import datetime, timedelta, timezone
from typing import Optional, List
from sqlalchemy.orm import Session as DBSession
from app.models.audit_log import AuditLog


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
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> AuditLog:
        """Create an audit log entry."""
        entry = AuditLog(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        self.db.add(entry)
        self.db.commit()
        self.db.refresh(entry)
        return entry

    def list_activity(
        self,
        user_id: str,
        action: Optional[str] = None,
        resource_type: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[AuditLog]:
        """List audit entries for a user with optional filters."""
        q = self.db.query(AuditLog).filter(AuditLog.user_id == user_id)
        if action:
            q = q.filter(AuditLog.action == action)
        if resource_type:
            q = q.filter(AuditLog.resource_type == resource_type)
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
    ) -> int:
        """Count audit entries (for pagination)."""
        q = self.db.query(AuditLog).filter(AuditLog.user_id == user_id)
        if action:
            q = q.filter(AuditLog.action == action)
        if resource_type:
            q = q.filter(AuditLog.resource_type == resource_type)
        return q.count()

    def cleanup_old_logs(self, days: int = 90) -> int:
        """Delete audit entries older than N days."""
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        count = (
            self.db.query(AuditLog)
            .filter(AuditLog.created_at < cutoff)
            .delete(synchronize_session=False)
        )
        self.db.commit()
        return count
