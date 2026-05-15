"""
Links Router — Zero-knowledge link-based file sharing

Link key lives in the URL fragment (#) and is never sent to the server.
FileKey is encrypted with the link key client-side.
Optional password protection via bcrypt.
"""

import secrets
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session as DBSession
import bcrypt

from app.database import get_db
from app.schemas.link import (
    CreateLinkRequest,
    LinkResponse,
    LinkPublicInfo,
    VerifyLinkPasswordRequest,
    VerifyLinkPasswordResponse,
    LinkListResponse,
)
from app.services.file import FileService
from app.services.audit import AuditService
from app.services.session import get_redis
from app.routers.auth import get_current_user
from app.models.user import User
from app.models.shared_link import SharedLink
from app.models.file import File

router = APIRouter(prefix="/links", tags=["links"])

LINK_TICKET_PREFIX = "link_ticket:"
LINK_TICKET_TTL_SECONDS = 10 * 60
LINK_PASSWORD_ATTEMPT_PREFIX = "link_password_attempt:"
LINK_PASSWORD_ATTEMPT_TTL_SECONDS = 10 * 60
LINK_PASSWORD_MAX_ATTEMPTS = 10


def _client_ip(request: Request) -> str:
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "unknown"


def _check_link_password_rate(token: str, request: Request) -> None:
    key = f"{LINK_PASSWORD_ATTEMPT_PREFIX}{token}:{_client_ip(request)}"
    r = get_redis()
    attempts = r.incr(key)
    if attempts == 1:
        r.expire(key, LINK_PASSWORD_ATTEMPT_TTL_SECONDS)
    if attempts > LINK_PASSWORD_MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Too many password attempts")


def _issue_download_ticket(link_id: str) -> str:
    ticket = secrets.token_urlsafe(32)
    get_redis().setex(f"{LINK_TICKET_PREFIX}{ticket}", LINK_TICKET_TTL_SECONDS, link_id)
    return ticket


def _consume_download_ticket(ticket: Optional[str], link_id: str) -> bool:
    if not ticket:
        return False
    key = f"{LINK_TICKET_PREFIX}{ticket}"
    stored = get_redis().execute_command("GETDEL", key)
    return stored == link_id


# ── Owner endpoints (authenticated) ──────────────────────────────────────

@router.post("/files/{file_id}", response_model=LinkResponse, status_code=201)
async def create_link(
    file_id: str,
    data: CreateLinkRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """Create a shareable link for a file the user owns."""
    file_svc = FileService(db)
    file_record = file_svc.get_file_by_id(file_id, current_user.id)
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    from datetime import datetime, timedelta, timezone
    from app.services.policy import policy_for
    policy = policy_for(current_user)

    # Cap how many active links the user can keep on this file.
    active_links = db.query(SharedLink).filter(
        SharedLink.file_id == file_id,
        SharedLink.owner_id == current_user.id,
        SharedLink.is_active.is_(True),
    ).count()
    if active_links >= policy.max_links_per_file:
        raise HTTPException(status_code=409, detail="Active link limit reached for this file")

    # Cap how far in the future the link may expire.
    if data.expiresAt is not None:
        max_horizon = datetime.now(timezone.utc) + timedelta(days=policy.max_link_expiry_days)
        expires_at = data.expiresAt
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at > max_horizon:
            raise HTTPException(
                status_code=400,
                detail=f"Expiry exceeds the {policy.max_link_expiry_days}-day plan limit",
            )

    password_hash = None
    if data.password:
        password_hash = bcrypt.hashpw(
            data.password.encode(), bcrypt.gensalt()
        ).decode()

    token = secrets.token_urlsafe(32)
    link = SharedLink(
        file_id=file_id,
        owner_id=current_user.id,
        token=token,
        encrypted_file_key=data.encryptedFileKey.model_dump(),
        encrypted_filename=data.encryptedFilename.model_dump(),
        password_hash=password_hash,
        expires_at=data.expiresAt,
        max_downloads=data.maxDownloads,
    )
    db.add(link)
    db.commit()
    db.refresh(link)

    AuditService(db).log(
        user_id=current_user.id,
        action="link_create",
        resource_type="link",
        resource_id=link.id,
        details={"file_id": file_id},
    )

    return LinkResponse.from_orm_model(link)


@router.get("/files/{file_id}", response_model=LinkListResponse)
async def list_links_for_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """List all active links for a file the user owns."""
    file_svc = FileService(db)
    file_record = file_svc.get_file_by_id(file_id, current_user.id)
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    links = (
        db.query(SharedLink)
        .join(File, SharedLink.file_id == File.id)
        .filter(
            SharedLink.file_id == file_id,
            SharedLink.owner_id == current_user.id,
            File.deleted_at.is_(None),
        )
        .order_by(SharedLink.created_at.desc())
        .all()
    )
    return LinkListResponse(
        links=[LinkResponse.from_orm_model(l) for l in links],
        totalCount=len(links),
    )


@router.get("/my-links", response_model=LinkListResponse)
async def list_my_links(
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """List all active shared links created by the current user."""
    links = (
        db.query(SharedLink)
        .join(File, SharedLink.file_id == File.id)
        .filter(
            SharedLink.owner_id == current_user.id,
            SharedLink.is_active == True,
            File.deleted_at.is_(None),
        )
        .order_by(SharedLink.created_at.desc())
        .all()
    )
    return LinkListResponse(
        links=[LinkResponse.from_orm_model(l) for l in links],
        totalCount=len(links),
    )


@router.delete("/{token}")
async def revoke_link(
    token: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """Revoke (deactivate) a shared link."""
    link = db.query(SharedLink).filter(
        SharedLink.token == token,
        SharedLink.owner_id == current_user.id,
    ).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")

    link.is_active = False
    db.commit()

    AuditService(db).log(
        user_id=current_user.id,
        action="link_revoke",
        resource_type="link",
        resource_id=link.id,
    )

    return {"success": True}


# ── Public / anonymous endpoints ─────────────────────────────────────────

@router.get("/public/{token}", response_model=LinkPublicInfo)
async def get_link_info(token: str, db: DBSession = Depends(get_db)):
    """
    Public endpoint — get metadata for a shared link.
    Returns encrypted filename and whether a password is required.
    """
    link: Optional[SharedLink] = db.query(SharedLink).filter(
        SharedLink.token == token,
    ).first()
    if not link or not link.is_available:
        raise HTTPException(status_code=404, detail="Link not found or expired")
    if not link.file or link.file.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Link not found or expired")

    return LinkPublicInfo(
        token=link.token,
        encryptedFilename=None if link.password_hash else link.encrypted_filename,
        encryptedFileKey=None if link.password_hash else link.encrypted_file_key,
        storageMode=getattr(link.file, "storage_mode", "single"),
        chunkManifest=getattr(link.file, "chunk_manifest", None),
        passwordRequired=link.password_hash is not None,
        expiresAt=link.expires_at,
        maxDownloads=link.max_downloads,
        downloadCount=link.download_count,
    )


@router.post("/public/{token}/verify-password", response_model=VerifyLinkPasswordResponse)
async def verify_link_password(
    token: str,
    data: VerifyLinkPasswordRequest,
    request: Request,
    db: DBSession = Depends(get_db),
):
    """Verify the password for a password-protected link."""
    link: Optional[SharedLink] = db.query(SharedLink).filter(
        SharedLink.token == token,
    ).first()
    if not link or not link.is_available:
        raise HTTPException(status_code=404, detail="Link not found or expired")
    if not link.file or link.file.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Link not found or expired")

    if not link.password_hash:
        return VerifyLinkPasswordResponse(
            valid=True,
            downloadTicket=None,
            encryptedFilename=link.encrypted_filename,
            encryptedFileKey=link.encrypted_file_key,
            storageMode=getattr(link.file, "storage_mode", "single") if link.file else "single",
            chunkManifest=getattr(link.file, "chunk_manifest", None) if link.file else None,
        )

    _check_link_password_rate(token, request)

    valid = bcrypt.checkpw(data.password.encode(), link.password_hash.encode())
    if not valid:
        AuditService(db).log(
            user_id=link.owner_id,
            action="link.password_verify",
            category="sharing",
            outcome="failure",
            severity="warning",
            resource_type="link",
            resource_id=link.id,
        )
        return VerifyLinkPasswordResponse(valid=False, downloadTicket=None)

    AuditService(db).log(
        user_id=link.owner_id,
        action="link.password_verify",
        category="sharing",
        resource_type="link",
        resource_id=link.id,
    )

    return VerifyLinkPasswordResponse(
        valid=True,
        downloadTicket=_issue_download_ticket(link.id),
        encryptedFilename=link.encrypted_filename,
        encryptedFileKey=link.encrypted_file_key,
        storageMode=getattr(link.file, "storage_mode", "single") if link.file else "single",
        chunkManifest=getattr(link.file, "chunk_manifest", None) if link.file else None,
    )


@router.get("/public/{token}/download")
async def download_via_link(
    token: str,
    ticket: Optional[str] = Query(None),
    db: DBSession = Depends(get_db),
):
    """
    Public download endpoint — returns the encrypted file content.

    The client uses the link key (from URL fragment) to decrypt.
    """
    link: Optional[SharedLink] = db.query(SharedLink).filter(
        SharedLink.token == token,
    ).with_for_update().first()
    if not link or not link.is_available:
        raise HTTPException(status_code=404, detail="Link not found or expired")

    file_record = link.file
    if not file_record or file_record.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Link not found or expired")

    if link.password_hash and not _consume_download_ticket(ticket, link.id):
        raise HTTPException(status_code=403, detail="Valid download ticket required")

    # Reserve the download while holding the row lock so max_downloads is atomic.
    link.download_count += 1
    db.commit()

    file_svc = FileService(db)
    content, error = await file_svc.read_file_content(file_record)
    if error:
        raise HTTPException(status_code=500, detail="Could not read file")

    AuditService(db).log(
        user_id=link.owner_id,
        action="link.download",
        category="sharing",
        resource_type="link",
        resource_id=link.id,
        details={"file_id": file_record.id, "download_count": link.download_count},
    )

    return StreamingResponse(
        iter([content]),
        media_type="application/octet-stream",
        headers={
            "Content-Length": str(len(content)),
            "X-Encrypted-Size": str(file_record.encrypted_size),
            "X-Encrypted-Sha256": file_record.content_sha256 or "",
        },
    )
