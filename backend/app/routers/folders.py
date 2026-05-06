"""
Folders Router — Encrypted folder CRUD

Backend is cryptographically blind to folder names.
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from app.database import get_db
from app.schemas.folder import (
    FolderCreateRequest,
    FolderResponse,
    FolderListResponse,
    FolderRenameRequest,
    FolderMoveRequest,
)
from app.services.folder import FolderService
from app.services.audit import AuditService
from app.routers.auth import get_current_user
from app.models.user import User

router = APIRouter(prefix="/folders", tags=["folders"])


@router.post("/", response_model=FolderResponse, status_code=201)
async def create_folder(
    data: FolderCreateRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """Create a new folder with an encrypted name."""
    svc = FolderService(db)
    folder, error = svc.create_folder(
        user=current_user,
        encrypted_name=data.encryptedName.model_dump(),
        parent_id=data.parentId,
    )
    if error:
        raise HTTPException(status_code=400, detail=error)

    AuditService(db).log(
        user_id=current_user.id,
        action="folder_create",
        resource_type="folder",
        resource_id=folder.id,
    )

    return FolderResponse.from_orm_model(folder)


@router.get("/", response_model=FolderListResponse)
async def list_folders(
    parent_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """List folders at a given level (root when parent_id omitted)."""
    svc = FolderService(db)
    folders = svc.list_folders(current_user, parent_id)
    return FolderListResponse(
        folders=[FolderResponse.from_orm_model(f) for f in folders],
        totalCount=len(folders),
    )


@router.get("/{folder_id}", response_model=FolderResponse)
async def get_folder(
    folder_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """Get a single folder."""
    svc = FolderService(db)
    folder = svc.get_folder(folder_id, current_user.id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    return FolderResponse.from_orm_model(folder)


@router.patch("/{folder_id}", response_model=FolderResponse)
async def rename_folder(
    folder_id: str,
    data: FolderRenameRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """Rename a folder (update encrypted name)."""
    svc = FolderService(db)
    folder = svc.get_folder(folder_id, current_user.id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    folder = svc.rename_folder(folder, data.encryptedName.model_dump())

    AuditService(db).log(
        user_id=current_user.id,
        action="folder_rename",
        resource_type="folder",
        resource_id=folder.id,
    )

    return FolderResponse.from_orm_model(folder)


@router.patch("/{folder_id}/move", response_model=FolderResponse)
async def move_folder(
    folder_id: str,
    data: FolderMoveRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """Move a folder to a new parent (or to root with parentId=null)."""
    svc = FolderService(db)
    folder = svc.get_folder(folder_id, current_user.id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    folder, error = svc.move_folder(folder, data.parentId, current_user.id)
    if error:
        raise HTTPException(status_code=400, detail=error)

    AuditService(db).log(
        user_id=current_user.id,
        action="folder_move",
        resource_type="folder",
        resource_id=folder.id,
    )

    return FolderResponse.from_orm_model(folder)


@router.delete("/{folder_id}")
async def delete_folder(
    folder_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """Delete a folder and all its contents (cascade)."""
    svc = FolderService(db)
    folder = svc.get_folder(folder_id, current_user.id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    ok, error = svc.delete_folder(folder)
    if not ok:
        raise HTTPException(status_code=500, detail=error)

    AuditService(db).log(
        user_id=current_user.id,
        action="folder_delete",
        resource_type="folder",
        resource_id=folder_id,
    )

    return {"success": True, "folderId": folder_id}
