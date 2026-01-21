"""
Sharing Router - Envelope Encryption File Sharing API

SECURITY:
- POST /share/{file_id}: Share a file (owner only)
- DELETE /share/{file_id}/{recipient_id}: Unshare a file (owner only)
- GET /shared/with-me: Files shared with current user
- GET /shared/by-me: Files current user has shared
- GET /users/search: Search users for sharing
- GET /users/{user_id}/public-key: Get user's public key
- POST /users/keypair: Update user's keypair

Backend is cryptographically blind:
- Cannot decrypt FileKeys
- Cannot read shared file content
- Only facilitates encrypted blob exchange
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session as DBSession
from app.database import get_db
from app.schemas import (
    UserPublicInfo,
    UserSearchResponse,
    ShareFileRequest,
    ShareFileResponse,
    SharedFileInfo,
    SharedWithMeResponse,
    SharedByMeResponse,
    UnshareResponse,
    UpdateKeypairRequest,
)
from app.schemas.file import EncryptedBlob
from app.services.sharing import SharingService
from app.services.file import FileService
from app.routers.auth import get_current_user
from app.models.user import User

router = APIRouter(prefix="/sharing", tags=["sharing"])


@router.get("/users/search", response_model=UserSearchResponse)
async def search_users(
    q: str = Query(..., min_length=1, description="Email search query"),
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """
    Search for users by email to share files with.
    
    Only returns users who have set up their keypair (can receive shares).
    """
    sharing_service = SharingService(db)
    users = sharing_service.search_users(q, current_user.id)
    
    return UserSearchResponse(
        users=[UserPublicInfo.from_orm_model(u) for u in users]
    )


@router.get("/users/{user_id}/public-key", response_model=UserPublicInfo)
async def get_user_public_key(
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """
    Get a user's public key for envelope encryption.
    
    Used by client to encrypt FileKey for the recipient.
    """
    sharing_service = SharingService(db)
    user = sharing_service.get_user_public_key(user_id)
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found or has no public key")
    
    return UserPublicInfo.from_orm_model(user)


@router.get("/users/me/private-key")
async def get_my_private_key(
    current_user: User = Depends(get_current_user),
):
    """
    Get current user's encrypted private key.
    
    SECURITY:
    - Returns encrypted blob that can only be decrypted with VaultKey
    - Needed to decrypt FileKeys received from other users
    """
    if not current_user.encrypted_private_key:
        raise HTTPException(status_code=404, detail="No private key set up")
    
    return {
        "encryptedPrivateKey": current_user.encrypted_private_key,
        "publicKey": current_user.public_key,
    }


@router.post("/users/keypair")
async def update_keypair(
    data: UpdateKeypairRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """
    Update the current user's keypair for envelope encryption.
    
    SECURITY:
    - publicKey is stored in plaintext (anyone can use it to encrypt for this user)
    - encryptedPrivateKey is encrypted with VaultKey (only user can decrypt)
    
    Called during registration or key rotation.
    """
    sharing_service = SharingService(db)
    sharing_service.update_user_keypair(
        user=current_user,
        public_key=data.publicKey,
        encrypted_private_key=data.encryptedPrivateKey.model_dump(),
    )
    
    return {"success": True, "message": "Keypair updated"}


@router.post("/files/{file_id}/share", response_model=ShareFileResponse)
async def share_file(
    file_id: str,
    data: ShareFileRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """
    Share a file with another user using envelope encryption.
    
    SECURITY:
    - Client encrypts FileKey with recipient's public key
    - Backend stores encrypted blob (cannot decrypt)
    - Only recipient can decrypt with their private key
    """
    sharing_service = SharingService(db)
    
    share, error = sharing_service.share_file(
        file_id=file_id,
        owner=current_user,
        recipient_id=data.recipientId,
        encrypted_file_key_for_recipient=data.encryptedFileKeyForRecipient.model_dump(),
    )
    
    if error:
        raise HTTPException(status_code=400, detail=error)
    
    return ShareFileResponse(
        shareId=share.id,
        fileId=share.file_id,
        recipientId=share.recipient_id,
        recipientEmail=share.recipient.email,
        sharedAt=share.shared_at,
    )


@router.delete("/files/{file_id}/share/{recipient_id}", response_model=UnshareResponse)
async def unshare_file(
    file_id: str,
    recipient_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """
    Remove sharing access for a user.
    
    Only the file owner can unshare.
    """
    sharing_service = SharingService(db)
    
    success, error = sharing_service.unshare_file(
        file_id=file_id,
        owner=current_user,
        recipient_id=recipient_id,
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=error)
    
    return UnshareResponse(
        success=True,
        fileId=file_id,
        recipientId=recipient_id,
    )


@router.get("/shared/with-me", response_model=SharedWithMeResponse)
async def get_files_shared_with_me(
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """
    Get all files shared with the current user.
    
    Returns encrypted metadata - client decrypts using:
    1. Decrypt FileKey with their private key
    2. Decrypt filename/metadata with FileKey
    """
    sharing_service = SharingService(db)
    shares = sharing_service.get_files_shared_with_me(current_user)
    
    files = []
    for share in shares:
        files.append(SharedFileInfo(
            shareId=share.id,
            fileId=share.file_id,
            encryptedFilename=share.file.encrypted_filename,
            encryptedMimeType=share.file.encrypted_mime_type if share.file.encrypted_mime_type else None,
            encryptedSize=share.file.encrypted_size,
            ownerId=share.owner_id,
            ownerEmail=share.owner.email,
            recipientId=share.recipient_id,
            recipientEmail=share.recipient.email,
            encryptedFileKeyForRecipient=share.encrypted_file_key_for_recipient,
            sharedAt=share.shared_at,
        ))
    
    return SharedWithMeResponse(
        files=files,
        totalCount=len(files),
    )


@router.get("/shared/by-me", response_model=SharedByMeResponse)
async def get_files_shared_by_me(
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """
    Get all files the current user has shared.
    
    Shows who has access to each file.
    """
    sharing_service = SharingService(db)
    shares = sharing_service.get_files_shared_by_me(current_user)
    
    share_list = []
    for share in shares:
        share_list.append(SharedFileInfo(
            shareId=share.id,
            fileId=share.file_id,
            encryptedFilename=share.file.encrypted_filename,
            encryptedMimeType=share.file.encrypted_mime_type if share.file.encrypted_mime_type else None,
            encryptedSize=share.file.encrypted_size,
            ownerId=share.owner_id,
            ownerEmail=share.owner.email,
            recipientId=share.recipient_id,
            recipientEmail=share.recipient.email,
            encryptedFileKeyForRecipient=share.encrypted_file_key_for_recipient,
            sharedAt=share.shared_at,
        ))
    
    return SharedByMeResponse(
        shares=share_list,
        totalCount=len(share_list),
    )


@router.get("/files/{file_id}/shares")
async def get_file_shares(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """
    Get all users a specific file is shared with.
    
    Only the file owner can see this.
    """
    # Verify ownership
    file_service = FileService(db)
    file = file_service.get_file_by_id(file_id, current_user.id)
    
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    
    # Get shares for this file
    from app.models.shared_file import SharedFile
    shares = db.query(SharedFile).filter(
        SharedFile.file_id == file_id,
        SharedFile.owner_id == current_user.id,
    ).all()
    
    return {
        "fileId": file_id,
        "shares": [
            {
                "recipientId": s.recipient_id,
                "recipientEmail": s.recipient.email,
                "sharedAt": s.shared_at,
            }
            for s in shares
        ]
    }
