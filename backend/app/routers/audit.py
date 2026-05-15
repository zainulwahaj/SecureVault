"""
Audit Router — User activity log

Returns audit entries for the authenticated user.
"""

from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session as DBSession
from app.database import get_db
from app.schemas.audit import AuditLogItem, AuditIntegrityResponse, AuditListResponse
from app.services.audit import AuditService
from app.routers.auth import get_current_user
from app.models.user import User

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("/", response_model=AuditListResponse)
async def list_audit_log(
    action: Optional[str] = Query(None, description="Filter by action type"),
    resource_type: Optional[str] = Query(None, description="Filter by resource type"),
    outcome: Optional[str] = Query(None, description="Filter by success/failure outcome"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """List audit log entries for the current user."""
    svc = AuditService(db)
    entries = svc.list_activity(
        user_id=current_user.id,
        action=action,
        resource_type=resource_type,
        outcome=outcome,
        limit=limit,
        offset=offset,
    )
    total = svc.count_activity(
        user_id=current_user.id,
        action=action,
        resource_type=resource_type,
        outcome=outcome,
    )
    return AuditListResponse(
        entries=[AuditLogItem.from_orm_model(e) for e in entries],
        totalCount=total,
    )


@router.get("/integrity", response_model=AuditIntegrityResponse)
async def verify_audit_integrity(
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """Verify the authenticated user's sealed audit hash chain."""
    result = AuditService(db).verify_user_chain(current_user.id)
    return AuditIntegrityResponse(**result)
