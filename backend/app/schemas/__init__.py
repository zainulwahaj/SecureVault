"""Pydantic Schemas for API validation"""
from app.schemas.user import (
    KdfParams,
    EncryptedBlob,
    ZKRegisterRequest,
    ZKLoginChallengeRequest,
    ZKLoginChallengeResponse,
    ZKLoginVerifyRequest,
    UserResponse,
    CurrentUserResponse,
    SessionResponse,
    ChangePasswordRequest,
    UpdateProfileRequest,
    UpdateAuthKeyRequest,
)
from app.schemas.file import (
    FileUploadMetadata,
    FileUploadResponse,
    FileListItem,
    FileListResponse,
    FileDeleteResponse,
)
from app.schemas.sharing import (
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
from app.schemas.mfa import (
    MFASetupRequest,
    MFASetupResponse,
    MFAStatusResponse,
    MFAVerifyRequest,
    MFAVerifyResponse,
    MFADisableRequest,
    MFADisableResponse,
    MFALoginChallengeResponse,
)
from app.schemas.folder import (
    FolderCreateRequest,
    FolderResponse,
    FolderListResponse,
    FolderRenameRequest,
    FolderMoveRequest,
)
from app.schemas.audit import (
    AuditLogItem,
    AuditListResponse,
)
from app.schemas.link import (
    CreateLinkRequest,
    LinkResponse,
    LinkPublicInfo,
    VerifyLinkPasswordRequest,
    VerifyLinkPasswordResponse,
    LinkListResponse,
)

__all__ = [
    # Auth schemas
    "KdfParams",
    "EncryptedBlob",
    "ZKRegisterRequest",
    "ZKLoginChallengeRequest",
    "ZKLoginChallengeResponse",
    "ZKLoginVerifyRequest",
    "UserResponse",
    "CurrentUserResponse",
    "SessionResponse",
    "UpdateProfileRequest",
    "UpdateAuthKeyRequest",
    # File schemas
    "FileUploadMetadata",
    "FileUploadResponse",
    "FileListItem",
    "FileListResponse",
    "FileDeleteResponse",
    # Sharing schemas
    "UserPublicInfo",
    "UserSearchResponse",
    "ShareFileRequest",
    "ShareFileResponse",
    "SharedFileInfo",
    "SharedWithMeResponse",
    "SharedByMeResponse",
    "UnshareResponse",
    "UpdateKeypairRequest",
    # MFA schemas
    "MFASetupRequest",
    "MFASetupResponse",
    "MFAStatusResponse",
    "MFAVerifyRequest",
    "MFAVerifyResponse",
    "MFADisableRequest",
    "MFADisableResponse",
    "MFALoginChallengeResponse",
    # Folder schemas
    "FolderCreateRequest",
    "FolderResponse",
    "FolderListResponse",
    "FolderRenameRequest",
    "FolderMoveRequest",
    # Audit schemas
    "AuditLogItem",
    "AuditListResponse",
    # Link schemas
    "CreateLinkRequest",
    "LinkResponse",
    "LinkPublicInfo",
    "VerifyLinkPasswordRequest",
    "VerifyLinkPasswordResponse",
    "LinkListResponse",
]
