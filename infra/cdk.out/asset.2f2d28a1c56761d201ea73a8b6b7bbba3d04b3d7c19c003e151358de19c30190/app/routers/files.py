"""
File Router - Zero-Knowledge Encrypted File Storage API

SECURITY:
- POST /upload: Accepts encrypted file + encrypted metadata
- GET /: List files (returns encrypted metadata for client decryption)
- GET /{file_id}: Download encrypted file content
- DELETE /{file_id}: Delete file from storage

Backend is cryptographically blind:
- Cannot decrypt file contents
- Cannot see original filenames
- Cannot read file metadata
"""

import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
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
from app.routers.auth import get_current_user
from app.models.user import User

router = APIRouter(prefix="/files", tags=["files"])
settings = get_settings()


@router.post("/upload", response_model=FileUploadResponse)
async def upload_file(
    file: UploadFile = File(..., description="Encrypted file content"),
    metadata: str = Form(..., description="JSON-encoded FileUploadMetadata"),
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """
    Upload an encrypted file.
    
    SECURITY:
    - File content is already encrypted by client (secretstream)
    - metadata contains encrypted FileKey, filename, and MIME type
    - Backend stores only opaque encrypted blobs
    - Backend CANNOT decrypt or inspect file contents
    
    Request:
    - file: Multipart file upload (encrypted bytes)
    - metadata: JSON string containing FileUploadMetadata
    """
    # Validate file size
    content = await file.read()
    if len(content) > settings.MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413, 
            detail=f"File too large. Maximum size is {settings.MAX_FILE_SIZE // (1024*1024)} MB"
        )
    
    # Parse metadata
    try:
        metadata_dict = json.loads(metadata)
        parsed_metadata = FileUploadMetadata(**metadata_dict)
    except (json.JSONDecodeError, Exception) as e:
        raise HTTPException(status_code=400, detail=f"Invalid metadata: {str(e)}")
    
    # Save file
    file_service = FileService(db)
    file_record, error = await file_service.save_file(
        user=current_user,
        encrypted_content=content,
        encrypted_file_key=parsed_metadata.encryptedFileKey.model_dump(),
        encrypted_filename=parsed_metadata.encryptedFilename.model_dump(),
        encrypted_mime_type=parsed_metadata.encryptedMimeType.model_dump() if parsed_metadata.encryptedMimeType else None,
    )
    
    if error:
        raise HTTPException(status_code=500, detail=error)
    
    return FileUploadResponse(
        fileId=file_record.id,
        encryptedSize=file_record.encrypted_size,
        createdAt=file_record.created_at,
    )


@router.get("/", response_model=FileListResponse)
async def list_files(
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """
    List all files for the authenticated user.
    
    SECURITY:
    - Returns encrypted metadata only
    - Client must decrypt filenames and metadata using VaultKey → FileKey
    - Backend cannot see real filenames
    """
    file_service = FileService(db)
    files = file_service.list_files(current_user)
    
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
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """
    Delete a file from storage.
    
    SECURITY:
    - Verifies ownership before deletion
    - Removes both file content and database record
    """
    file_service = FileService(db)
    
    # Get file record, verifying ownership
    file_record = file_service.get_file_by_id(file_id, current_user.id)
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    
    # Delete file
    success, error = await file_service.delete_file(file_record)
    if not success:
        raise HTTPException(status_code=500, detail=error)
    
    return FileDeleteResponse(
        success=True,
        fileId=file_id,
    )
