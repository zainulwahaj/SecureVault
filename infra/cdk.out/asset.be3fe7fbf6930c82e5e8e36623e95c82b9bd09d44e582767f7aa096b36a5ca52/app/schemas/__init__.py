"""Pydantic Schemas for API validation"""
from app.schemas.user import (
    KdfParams,
    EncryptedBlob,
    ZKRegisterRequest,
    ZKLoginChallengeRequest,
    ZKLoginChallengeResponse,
    ZKLoginVerifyRequest,
    UserResponse,
    SessionResponse,
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

__all__ = [
    # Auth schemas
    "KdfParams",
    "EncryptedBlob",
    "ZKRegisterRequest",
    "ZKLoginChallengeRequest",
    "ZKLoginChallengeResponse",
    "ZKLoginVerifyRequest",
    "UserResponse",
    "SessionResponse",
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
]
