"""Audit Schemas — Activity log entries"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class AuditLogItem(BaseModel):
    """A single audit log entry."""
    id: str
    action: str
    category: str = "application"
    outcome: str = "success"
    severity: str = "info"
    resourceType: Optional[str] = None
    resourceId: Optional[str] = None
    details: Optional[dict] = None
    requestId: Optional[str] = None
    sessionIdHash: Optional[str] = None
    ipAddress: Optional[str] = None
    userAgent: Optional[str] = None
    sequenceNumber: Optional[int] = None
    prevHash: Optional[str] = None
    eventHash: Optional[str] = None
    hashVersion: str = "hmac-sha256-v1"
    createdAt: datetime

    @classmethod
    def from_orm_model(cls, entry) -> "AuditLogItem":
        return cls(
            id=entry.id,
            action=entry.action,
            category=entry.category or "application",
            outcome=entry.outcome or "success",
            severity=entry.severity or "info",
            resourceType=entry.resource_type,
            resourceId=entry.resource_id,
            details=entry.details,
            requestId=entry.request_id,
            sessionIdHash=entry.session_id_hash,
            ipAddress=entry.ip_address,
            userAgent=entry.user_agent,
            sequenceNumber=entry.sequence_number,
            prevHash=entry.prev_hash,
            eventHash=entry.event_hash,
            hashVersion=entry.hash_version or "hmac-sha256-v1",
            createdAt=entry.created_at,
        )


class AuditListResponse(BaseModel):
    """Paginated audit log response."""
    entries: List[AuditLogItem] = Field(default_factory=list)
    totalCount: int


class AuditIntegrityResponse(BaseModel):
    """Audit hash-chain verification result."""
    valid: bool
    checkedCount: int
    failedEntryId: Optional[str] = None
    reason: Optional[str] = None
