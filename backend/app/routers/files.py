"""
File Router - Zero-Knowledge Encrypted File Storage API

Supports upload, list, download, delete, trash, restore, versioning, and move.
Backend is cryptographically blind.
"""

import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session as DBSession
from app.database import get_db
from app.config import get_settings
from app.schemas import (
    FileUploadMetadata,
    FileUploadResponse,
    FileListItem,
    FileListResponse,
    FileDeleteResponse,
)
from app.services.file import FileService
from app.services.sharing import SharingService
from app.services.trash import TrashService
from app.services.versioning import VersioningService
from app.services.audit import AuditService
from app.routers.auth import get_current_user
from app.models.user import User

router = APIRouter(prefix="/files", tags=["files"])
settings = get_settings()


@router.post("/upload", response_model=FileUploadResponse)
async def upload_file(
    file: UploadFile = File(..., description="Encrypted file content"),
    metadata: str = Form(..., description="JSON-encoded FileUploadMetadata"),
    folder_id: Optional[str] = Form(None, description="Optional folder ID"),
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """
    Upload an encrypted file.
    
    If a file with the same ID already exists (re-upload), the current content
    is saved as a version before being overwritten.
    """
    content = await file.read()
    if len(content) > settings.MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413, 
            detail=f"File too large. Maximum size is {settings.MAX_FILE_SIZE // (1024*1024)} MB"
        )
    
    try:
        metadata_dict = json.loads(metadata)
        parsed_metadata = FileUploadMetadata(**metadata_dict)
    except (json.JSONDecodeError, Exception) as e:
        raise HTTPException(status_code=400, detail=f"Invalid metadata: {str(e)}")
    
    file_service = FileService(db)
    file_record, error = await file_service.save_file(
        user=current_user,
        encrypted_content=content,
        encrypted_file_key=parsed_metadata.encryptedFileKey.model_dump(),
        encrypted_filename=parsed_metadata.encryptedFilename.model_dump(),
        encrypted_mime_type=parsed_metadata.encryptedMimeType.model_dump() if parsed_metadata.encryptedMimeType else None,
        folder_id=folder_id,
    )
    
    if error:
        raise HTTPException(status_code=500, detail=error)

    AuditService(db).log(
        user_id=current_user.id,
        action="file_upload",
        resource_type="file",
        resource_id=file_record.id,
    )
    
    return FileUploadResponse(
        fileId=file_record.id,
        encryptedSize=file_record.encrypted_size,
        createdAt=file_record.created_at,
    )


@router.get("/", response_model=FileListResponse)
async def list_files(
    folder_id: Optional[str] = Query(None, description="Filter by folder (null = root)"),
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """List non-trashed files for the authenticated user, optionally within a folder."""
    file_service = FileService(db)
    files = file_service.list_files(current_user, folder_id=folder_id)
    
    return FileListResponse(
        files=[FileListItem.from_orm_model(f) for f in files],
        totalCount=len(files),
    )


# ─── Trash endpoints ─────────────────────────────────────────────────────

@router.get("/trash/list", response_model=FileListResponse)
async def list_trash(
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """List all trashed files."""
    trash_svc = TrashService(db)
    files = trash_svc.list_trashed(current_user)
    return FileListResponse(
        files=[FileListItem.from_orm_model(f) for f in files],
        totalCount=len(files),
    )


@router.get("/{file_id}")
async def download_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """
    Download an encrypted file.
    
    SECURITY:
    - Returns encrypted file content as-is
    - Client must decrypt using FileKey (decrypted from encryptedFileKey with VaultKey)
    - Backend cannot decrypt file contents
    - Allows download if user owns the file OR if file is shared with them
    
    Response:
    - Binary stream of encrypted file content
    - Content-Type: application/octet-stream (always, since content is encrypted)
    """
    file_service = FileService(db)
    sharing_service = SharingService(db)
    
    # First check if user owns the file
    file_record = file_service.get_file_by_id(file_id, current_user.id)
    
    # If not owned, check if shared with the user
    if not file_record:
        share = sharing_service.get_share_by_id(file_id, current_user.id)
        if share:
            file_record = share.file
    
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    
    # Read encrypted content
    content, error = await file_service.read_file_content(file_record)
    if error:
        raise HTTPException(status_code=500, detail=error)
    
    # Return encrypted content as binary stream
    # Note: We use application/octet-stream since content is encrypted
    # Client will decrypt and determine actual content type
    return StreamingResponse(
        iter([content]),
        media_type="application/octet-stream",
        headers={
            # Include file ID and size in headers for client reference
            "X-File-Id": file_record.id,
            "X-Encrypted-Size": str(file_record.encrypted_size),
            "Content-Length": str(len(content)),
        }
    )


@router.get("/{file_id}/metadata", response_model=FileListItem)
async def get_file_metadata(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """
    Get encrypted metadata for a specific file.
    
    SECURITY:
    - Returns encrypted metadata only
    - Client decrypts filename/mimetype using FileKey → VaultKey
    """
    file_service = FileService(db)
    
    file_record = file_service.get_file_by_id(file_id, current_user.id)
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    
    return FileListItem.from_orm_model(file_record)


@router.delete("/{file_id}", response_model=FileDeleteResponse)
async def delete_file(
    file_id: str,
    permanent: bool = Query(False, description="Permanently delete instead of trashing"),
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """
    Delete a file. Soft-deletes (trash) by default.
    Pass ?permanent=true to permanently remove.
    """
    file_service = FileService(db)
    
    file_record = file_service.get_file_by_id(file_id, current_user.id)
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    if permanent:
        success, error = await file_service.delete_file(file_record)
        if not success:
            raise HTTPException(status_code=500, detail=error)
    else:
        TrashService(db).trash_file(file_record)

    AuditService(db).log(
        user_id=current_user.id,
        action="file_delete" if permanent else "file_trash",
        resource_type="file",
        resource_id=file_id,
    )
    
    return FileDeleteResponse(success=True, fileId=file_id)


@router.post("/{file_id}/restore", response_model=FileListItem)
async def restore_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """Restore a file from trash."""
    from app.models.file import File as FileModel
    file_record = db.query(FileModel).filter(
        FileModel.id == file_id,
        FileModel.user_id == current_user.id,
        FileModel.deleted_at.isnot(None),
    ).first()
    if not file_record:
        raise HTTPException(status_code=404, detail="Trashed file not found")

    file_record = TrashService(db).restore_file(file_record)

    AuditService(db).log(
        user_id=current_user.id,
        action="file_restore",
        resource_type="file",
        resource_id=file_id,
    )

    return FileListItem.from_orm_model(file_record)


# ─── Version endpoints ───────────────────────────────────────────────────

@router.get("/{file_id}/versions")
async def list_versions(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """List all versions of a file."""
    file_svc = FileService(db)
    file_record = file_svc.get_file_by_id(file_id, current_user.id)
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    ver_svc = VersioningService(db)
    versions = ver_svc.get_versions(file_record)
    return {
        "versions": [
            {
                "id": v.id,
                "versionNumber": v.version_number,
                "encryptedFileKey": v.encrypted_file_key,
                "encryptedSize": v.encrypted_size,
                "createdAt": v.created_at.isoformat(),
            }
            for v in versions
        ],
        "totalCount": len(versions),
    }


@router.get("/{file_id}/versions/{version_number}/download")
async def download_version(
    file_id: str,
    version_number: int,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """Download a specific version of a file."""
    file_svc = FileService(db)
    file_record = file_svc.get_file_by_id(file_id, current_user.id)
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    ver_svc = VersioningService(db)
    version = ver_svc.get_version(file_record, version_number)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    content, error = await ver_svc.read_version_content(version, current_user.id)
    if error:
        raise HTTPException(status_code=500, detail=error)

    return StreamingResponse(
        iter([content]),
        media_type="application/octet-stream",
        headers={"Content-Length": str(len(content))},
    )


# ─── Move endpoint ───────────────────────────────────────────────────────

@router.patch("/{file_id}/move")
async def move_file(
    file_id: str,
    folder_id: Optional[str] = Query(None, description="Target folder (null = root)"),
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """Move a file to a different folder (or to root with folder_id=null)."""
    file_svc = FileService(db)
    file_record = file_svc.get_file_by_id(file_id, current_user.id)
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    if folder_id:
        from app.services.folder import FolderService
        folder = FolderService(db).get_folder(folder_id, current_user.id)
        if not folder:
            raise HTTPException(status_code=404, detail="Target folder not found")

    file_record.folder_id = folder_id
    db.commit()
    db.refresh(file_record)

    AuditService(db).log(
        user_id=current_user.id,
        action="file_move",
        resource_type="file",
        resource_id=file_id,
    )

    return FileListItem.from_orm_model(file_record)
