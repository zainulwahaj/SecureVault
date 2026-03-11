"""Audit Schemas — Activity log entries"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class AuditLogItem(BaseModel):
    """A single audit log entry."""
    id: str
    action: str
    resourceType: Optional[str] = None
    resourceId: Optional[str] = None
    details: Optional[dict] = None
    ipAddress: Optional[str] = None
    createdAt: datetime

    @classmethod
    def from_orm_model(cls, entry) -> "AuditLogItem":
        return cls(
            id=entry.id,
            action=entry.action,
            resourceType=entry.resource_type,
            resourceId=entry.resource_id,
            details=entry.details,
            ipAddress=entry.ip_address,
            createdAt=entry.created_at,
        )


class AuditListResponse(BaseModel):
    """Paginated audit log response."""
    entries: List[AuditLogItem] = Field(default_factory=list)
    totalCount: int
