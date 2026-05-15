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

from datetime import datetime
from typing import Optional
import json
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy import or_
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
    FileShareInfo,
    FileSharesResponse,
    UnshareResponse,
    UpdateKeypairRequest,
    DeviceKeyCreateRequest,
    DeviceKeyInfo,
    DeviceKeyListResponse,
    DeviceKeyRevokeResponse,
    ShareEnvelopeInfo,
    StrongRevokeResponse,
    RotateFileContentMetadata,
    RotateFileContentResponse,
)
from app.schemas.file import EncryptedBlob
from app.services.sharing import SharingService
from app.services.file import FileService
from app.services.audit import AuditService
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


@router.get("/users/me/device-keys", response_model=DeviceKeyListResponse)
async def list_my_device_keys(
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """List active sharing device keys for the current user."""
    keys = SharingService(db).list_device_keys(current_user)
    return DeviceKeyListResponse(
        deviceKeys=[DeviceKeyInfo.from_orm_model(k) for k in keys],
        totalCount=len(keys),
    )


@router.post("/users/me/device-keys", response_model=DeviceKeyInfo, status_code=201)
async def register_my_device_key(
    data: DeviceKeyCreateRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """Register or refresh a per-device public key for future share envelopes."""
    key, error = SharingService(db).register_device_key(
        current_user,
        encryption_public_key=data.encryptionPublicKey,
        signing_public_key=data.signingPublicKey,
        device_label=data.deviceLabel,
    )
    if error:
        raise HTTPException(status_code=400, detail=error)
    AuditService(db).log(
        user_id=current_user.id,
        action="sharing.device_key_register",
        category="security",
        resource_type="device_key",
        resource_id=key.id,
        details={"fingerprint": key.fingerprint},
    )
    return DeviceKeyInfo.from_orm_model(key)


@router.delete("/users/me/device-keys/{device_key_id}", response_model=DeviceKeyRevokeResponse)
async def revoke_my_device_key(
    device_key_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """Revoke one sharing device key and disable its active envelopes."""
    success, error = SharingService(db).revoke_device_key(current_user, device_key_id)
    if not success:
        raise HTTPException(status_code=400, detail=error)
    AuditService(db).log(
        user_id=current_user.id,
        action="sharing.device_key_revoke",
        category="security",
        resource_type="device_key",
        resource_id=device_key_id,
    )
    return DeviceKeyRevokeResponse(success=True, deviceKeyId=device_key_id)


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
    _, error = sharing_service.update_user_keypair(
        user=current_user,
        public_key=data.publicKey,
        encrypted_private_key=data.encryptedPrivateKey,
    )
    if error:
        raise HTTPException(status_code=400, detail=error)

    AuditService(db).log(
        user_id=current_user.id,
        action="sharing.key_update",
        category="security",
        resource_type="user_key",
        resource_id=current_user.id,
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
        permission=data.permission,
        expires_at=data.expiresAt,
        recipient_public_key_fingerprint=data.recipientPublicKeyFingerprint,
        device_envelopes=[e.model_dump() for e in data.deviceEnvelopes],
    )
    
    if error:
        raise HTTPException(status_code=400, detail=error)

    AuditService(db).log(
        user_id=current_user.id,
        action="share.create",
        category="sharing",
        resource_type="share",
        resource_id=share.id,
        details={
            "file_id": file_id,
            "recipient_id": data.recipientId,
            "permission": share.permission,
            "public_key_fingerprint": share.recipient_key.fingerprint if share.recipient_key else None,
        },
    )
    
    return ShareFileResponse(
        shareId=share.id,
        fileId=share.file_id,
        recipientId=share.recipient_id,
        recipientEmail=share.recipient.email,
        permission=share.permission,
        publicKeyFingerprint=share.recipient_key.fingerprint if share.recipient_key else None,
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

    AuditService(db).log(
        user_id=current_user.id,
        action="share.revoke",
        category="sharing",
        resource_type="share",
        resource_id=file_id,
        details={"recipient_id": recipient_id},
    )
    
    return UnshareResponse(
        success=True,
        fileId=file_id,
        recipientId=recipient_id,
    )


@router.post("/files/{file_id}/share/{recipient_id}/strong-revoke", response_model=StrongRevokeResponse)
async def strong_revoke_share(
    file_id: str,
    recipient_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """Revoke server access and flag that client-side key rotation is required."""
    success, error = SharingService(db).strong_revoke_share(file_id, current_user, recipient_id)
    if not success:
        raise HTTPException(status_code=400, detail=error)
    AuditService(db).log(
        user_id=current_user.id,
        action="share.strong_revoke_requested",
        category="sharing",
        resource_type="file",
        resource_id=file_id,
        details={"recipient_id": recipient_id, "key_rotation_required": True},
    )
    return StrongRevokeResponse(
        success=True,
        fileId=file_id,
        recipientId=recipient_id,
        keyRotationRequired=True,
        message="Recipient access was revoked. Re-encrypt the file with a new FileKey before granting access again.",
    )


@router.post("/files/{file_id}/rotate-content", response_model=RotateFileContentResponse)
async def rotate_file_content(
    file_id: str,
    file: UploadFile = File(..., description="New encrypted file content (single blob)"),
    metadata: str = Form(..., description="JSON-encoded RotateFileContentMetadata"),
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """Strong-revocation rewrap: replace the file's ciphertext and rotate
    every active recipient's envelope under a new FileKey.

    Recipients whose envelopes are not included in the request lose access
    (their old envelopes are revoked and no new ones are written). All public
    links on this file are deactivated.
    """
    try:
        metadata_dict = json.loads(metadata)
        parsed = RotateFileContentMetadata(**metadata_dict)
    except (json.JSONDecodeError, Exception) as e:
        raise HTTPException(status_code=400, detail=f"Invalid metadata: {e}")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty content not allowed")

    file_service = FileService(db)
    file_record = file_service.get_file_by_id(file_id, current_user.id)
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    summary, error = await file_service.rotate_file_content(
        file_record=file_record,
        owner=current_user,
        encrypted_content=content,
        encrypted_file_key=parsed.encryptedFileKey.model_dump(),
        encrypted_filename=parsed.encryptedFilename.model_dump() if parsed.encryptedFilename else None,
        encrypted_mime_type=parsed.encryptedMimeType.model_dump() if parsed.encryptedMimeType else None,
        recipient_envelopes=[env.model_dump() for env in parsed.recipientEnvelopes],
    )
    if error or summary is None:
        status_code = 413 if "quota" in (error or "").lower() or "too large" in (error or "").lower() else 400
        raise HTTPException(status_code=status_code, detail=error or "Rotation failed")

    AuditService(db).log(
        user_id=current_user.id,
        action="file.rotate_content",
        category="sharing",
        resource_type="file",
        resource_id=file_id,
        details={
            "rotated_share_ids": summary["rotatedShareIds"],
            "revoked_share_ids": summary["revokedShareIds"],
            "revoked_link_ids": summary["revokedLinkIds"],
            "key_version": summary["keyVersion"],
        },
    )

    return RotateFileContentResponse(
        success=True,
        fileId=file_id,
        rotatedShareIds=summary["rotatedShareIds"],
        revokedShareIds=summary["revokedShareIds"],
        revokedLinkIds=summary["revokedLinkIds"],
        keyVersion=summary["keyVersion"],
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
            storageMode=getattr(share.file, "storage_mode", "single"),
            chunkManifest=getattr(share.file, "chunk_manifest", None),
            ownerId=share.owner_id,
            ownerEmail=share.owner.email,
            recipientId=share.recipient_id,
            recipientEmail=share.recipient.email,
            encryptedFileKeyForRecipient=share.encrypted_file_key_for_recipient,
            permission=share.permission,
            expiresAt=share.expires_at,
            revokedAt=share.revoked_at,
            publicKeyFingerprint=share.recipient_key.fingerprint if share.recipient_key else None,
            envelopes=[ShareEnvelopeInfo.from_orm_model(e) for e in share.envelopes if e.revoked_at is None],
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
            storageMode=getattr(share.file, "storage_mode", "single"),
            chunkManifest=getattr(share.file, "chunk_manifest", None),
            ownerId=share.owner_id,
            ownerEmail=share.owner.email,
            recipientId=share.recipient_id,
            recipientEmail=share.recipient.email,
            encryptedFileKeyForRecipient=share.encrypted_file_key_for_recipient,
            encryptedFileKeyForOwner=share.file.encrypted_file_key,
            permission=share.permission,
            expiresAt=share.expires_at,
            revokedAt=share.revoked_at,
            publicKeyFingerprint=share.recipient_key.fingerprint if share.recipient_key else None,
            envelopes=[ShareEnvelopeInfo.from_orm_model(e) for e in share.envelopes if e.revoked_at is None],
            sharedAt=share.shared_at,
        ))
    
    return SharedByMeResponse(
        shares=share_list,
        totalCount=len(share_list),
    )


@router.get("/files/{file_id}/shares", response_model=FileSharesResponse)
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
        SharedFile.revoked_at.is_(None),
        or_(SharedFile.expires_at.is_(None), SharedFile.expires_at > datetime.utcnow()),
    ).all()
    
    return FileSharesResponse(
        fileId=file_id,
        shares=[
            FileShareInfo(
                recipientId=s.recipient_id,
                recipientEmail=s.recipient.email,
                permission=s.permission,
                publicKeyFingerprint=s.recipient_key.fingerprint if s.recipient_key else None,
                envelopeCount=len([e for e in s.envelopes if e.revoked_at is None]),
                sharedAt=s.shared_at,
            )
            for s in shares
        ],
    )
