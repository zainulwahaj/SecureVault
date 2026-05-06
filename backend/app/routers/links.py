"""
Links Router — Zero-knowledge link-based file sharing

Link key lives in the URL fragment (#) and is never sent to the server.
FileKey is encrypted with the link key client-side.
Optional password protection via bcrypt.
"""

import secrets
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
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
from app.routers.auth import get_current_user
from app.models.user import User
from app.models.shared_link import SharedLink

router = APIRouter(prefix="/links", tags=["links"])


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
        .filter(SharedLink.file_id == file_id, SharedLink.owner_id == current_user.id)
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
        .filter(SharedLink.owner_id == current_user.id, SharedLink.is_active == True)
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

    return LinkPublicInfo(
        token=link.token,
        encryptedFilename=link.encrypted_filename,
        encryptedFileKey=link.encrypted_file_key,
        passwordRequired=link.password_hash is not None,
        expiresAt=link.expires_at,
        maxDownloads=link.max_downloads,
        downloadCount=link.download_count,
    )


@router.post("/public/{token}/verify-password", response_model=VerifyLinkPasswordResponse)
async def verify_link_password(
    token: str,
    data: VerifyLinkPasswordRequest,
    db: DBSession = Depends(get_db),
):
    """Verify the password for a password-protected link."""
    link: Optional[SharedLink] = db.query(SharedLink).filter(
        SharedLink.token == token,
    ).first()
    if not link or not link.is_available:
        raise HTTPException(status_code=404, detail="Link not found or expired")

    if not link.password_hash:
        return VerifyLinkPasswordResponse(valid=True)

    valid = bcrypt.checkpw(data.password.encode(), link.password_hash.encode())
    return VerifyLinkPasswordResponse(valid=valid)


@router.get("/public/{token}/download")
async def download_via_link(
    token: str,
    db: DBSession = Depends(get_db),
):
    """
    Public download endpoint — returns the encrypted file content.

    The client uses the link key (from URL fragment) to decrypt.
    """
    link: Optional[SharedLink] = db.query(SharedLink).filter(
        SharedLink.token == token,
    ).first()
    if not link or not link.is_available:
        raise HTTPException(status_code=404, detail="Link not found or expired")

    file_svc = FileService(db)
    content, error = await file_svc.read_file_content(link.file)
    if error:
        raise HTTPException(status_code=500, detail="Could not read file")

    # Increment download count
    link.download_count += 1
    db.commit()

    return StreamingResponse(
        iter([content]),
        media_type="application/octet-stream",
        headers={
            "Content-Length": str(len(content)),
            "X-Encrypted-Size": str(link.file.encrypted_size),
        },
    )
