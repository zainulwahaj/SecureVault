/**
 * API client for Zero-Knowledge Authentication & File Storage
 * 
 * SECURITY:
 * - Passwords are processed client-side only
 * - Only encrypted data is sent to the backend
 * - Backend cannot decrypt user data or file contents
 */

import type { 
  ApiResponse, 
  SessionInfo, 
  User,
  ZKRegistrationData,
  ZKLoginChallenge,
  FileListResponse,
  FileUploadResponse,
  FileDeleteResponse,
  UserPublicInfo,
  SharedFile,
  ShareFileResponse,
  MFAStatus,
  MFASetupResponse,
  MFAVerifyResponse,
  FolderResponse,
  FolderListResponse,
  FileVersionListResponse,
  SharedLinkResponse,
  SharedLinkListResponse,
  SharedLinkPublicInfo,
  AuditListResponse,
} from '@/types';
import type { EncryptedBlob } from './crypto/types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '/api';

/**
 * Generic fetch wrapper with error handling
 */
async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      credentials: 'include', // Important for session cookies
    });

    const data = await response.json();

    if (!response.ok) {
      // Handle different error formats from FastAPI
      let errorMessage = 'An error occurred';
      if (typeof data.detail === 'string') {
        errorMessage = data.detail;
      } else if (Array.isArray(data.detail)) {
        // Validation errors come as array of {loc, msg, type}
        errorMessage = data.detail.map((e: { msg: string }) => e.msg).join(', ');
      } else if (data.detail?.msg) {
        errorMessage = data.detail.msg;
      } else if (data.message) {
        errorMessage = data.message;
      }
      return {
        success: false,
        error: errorMessage,
      };
    }

    return {
      success: true,
      data,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

/**
 * Register a new user with zero-knowledge authentication.
 * 
 * SECURITY: No password sent - only encrypted data.
 * 
 * @param data - Registration data prepared client-side
 * @param loginProof - SHA-256 hash of VaultKey for future login verification
 */
export async function register(
  data: ZKRegistrationData,
  loginProof: string
): Promise<ApiResponse<SessionInfo>> {
  return fetchApi<SessionInfo>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      ...data,
      loginProof,
    }),
  });
}

/**
 * Get login challenge (encrypted data to decrypt).
 * 
 * @param email - User's email address
 * @returns Challenge data for client-side decryption attempt
 */
export async function getLoginChallenge(
  email: string
): Promise<ApiResponse<ZKLoginChallenge>> {
  return fetchApi<ZKLoginChallenge>('/auth/login/challenge', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

/**
 * Verify login by providing decryption proof.
 * 
 * SECURITY: Proof is hash of decrypted VaultKey, not the key itself.
 * 
 * @param email - User's email address
 * @param proof - SHA-256 hash of successfully decrypted VaultKey
 */
export async function verifyLogin(
  email: string,
  payload: {
    challengeId?: string;
    signature?: string;
    proof?: string;
  }
): Promise<ApiResponse<SessionInfo>> {
  return fetchApi<SessionInfo>('/auth/login/verify', {
    method: 'POST',
    body: JSON.stringify({ email, ...payload }),
  });
}

export async function upgradeAuthKey(payload: {
  authPublicKey: string;
  encryptedAuthPrivateKey: EncryptedBlob;
}): Promise<ApiResponse<{ success: boolean }>> {
  return fetchApi<{ success: boolean }>('/auth/upgrade-auth-key', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Logout current user (destroy session)
 */
export async function logout(): Promise<ApiResponse<void>> {
  return fetchApi<void>('/auth/logout', {
    method: 'POST',
  });
}

export async function changePassword(payload: {
  oldProof: string;
  salt: string;
  kdfParams: { algorithm: string; iterations: number; keyLength: number; version: number };
  encryptedVaultKey: { ciphertext: string; algorithm: string; version: number };
  loginProof: string;
  encryptedPrivateKey: string;
}): Promise<ApiResponse<{ success: boolean; message: string }>> {
  return fetchApi<{ success: boolean; message: string }>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Get current authenticated user from session
 */
export async function getCurrentUser(): Promise<ApiResponse<User>> {
  return fetchApi<User>('/auth/me');
}

export async function updateProfile(payload: {
  displayName?: string | null;
  avatarUrl?: string | null;
}): Promise<ApiResponse<User>> {
  return fetchApi<User>('/auth/profile', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

// ============================================================================
// File API - Zero-Knowledge Encrypted File Storage
// ============================================================================

/**
 * Upload an encrypted file.
 * 
 * SECURITY:
 * - File content is already encrypted client-side
 * - Metadata contains encrypted FileKey, filename, MIME type
 * - Backend cannot decrypt anything
 * 
 * @param encryptedContent - File content encrypted with FileKey
 * @param metadata - Encrypted metadata (FileKey, filename, MIME type)
 */
export async function uploadFile(
  encryptedContent: Uint8Array,
  metadata: {
    encryptedFileKey: { ciphertext: string; algorithm: string; version: number };
    encryptedFilename: { ciphertext: string; algorithm: string; version: number };
    encryptedMimeType: { ciphertext: string; algorithm: string; version: number };
  },
  folderId?: string | null,
): Promise<ApiResponse<FileUploadResponse>> {
  try {
    // Create FormData for multipart upload
    const formData = new FormData();
    
    // Add encrypted file as blob - create new ArrayBuffer from Uint8Array
    const arrayBuffer = new ArrayBuffer(encryptedContent.length);
    new Uint8Array(arrayBuffer).set(encryptedContent);
    const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' });
    formData.append('file', blob, 'encrypted');
    
    // Add metadata as JSON string
    formData.append('metadata', JSON.stringify(metadata));

    // Optional folder
    if (folderId) {
      formData.append('folder_id', folderId);
    }
    
    const response = await fetch(`${API_BASE}/files/upload`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
      // Don't set Content-Type - browser will set it with boundary for multipart
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return {
        success: false,
        error: data.detail || 'Upload failed',
      };
    }
    
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    };
  }
}

/**
 * List all encrypted files for the current user.
 * 
 * Returns encrypted metadata - client must decrypt filenames.
 */
export async function listFiles(folderId?: string | null): Promise<ApiResponse<FileListResponse>> {
  const params = folderId ? `?folder_id=${encodeURIComponent(folderId)}` : '';
  return fetchApi<FileListResponse>(`/files/${params}`);
}

/**
 * Download encrypted file content.
 * 
 * Returns raw encrypted bytes - client must decrypt with FileKey.
 * 
 * @param fileId - ID of file to download
 */
export async function downloadFile(fileId: string): Promise<ApiResponse<Uint8Array>> {
  try {
    const response = await fetch(`${API_BASE}/files/${fileId}`, {
      method: 'GET',
      credentials: 'include',
    });
    
    if (!response.ok) {
      const data = await response.json();
      return {
        success: false,
        error: data.detail || 'Download failed',
      };
    }
    
    const arrayBuffer = await response.arrayBuffer();
    return {
      success: true,
      data: new Uint8Array(arrayBuffer),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Download failed',
    };
  }
}

/**
 * Delete a file from storage.
 * 
 * @param fileId - ID of file to delete
 */
export async function deleteFile(fileId: string, permanent: boolean = false): Promise<ApiResponse<FileDeleteResponse>> {
  const params = permanent ? '?permanent=true' : '';
  return fetchApi<FileDeleteResponse>(`/files/${fileId}${params}`, {
    method: 'DELETE',
  });
}

// ============================================================================
// Sharing API
// ============================================================================

/**
 * Search users by email for sharing
 */
export async function searchUsers(query: string): Promise<ApiResponse<UserPublicInfo[]>> {
  const response = await fetchApi<{ users: UserPublicInfo[] }>(`/sharing/users/search?q=${encodeURIComponent(query)}`);
  if (response.success && response.data) {
    return { success: true, data: response.data.users };
  }
  return { success: false, error: response.error };
}

/**
 * Get a user's public key for envelope encryption
 */
export async function getUserPublicKey(userId: string): Promise<ApiResponse<{ publicKey: string }>> {
  return fetchApi<{ publicKey: string }>(`/sharing/users/${userId}/public-key`);
}

/**
 * Share a file with another user
 * 
 * @param fileId - ID of file to share
 * @param recipientId - ID of user to share with
 * @param encryptedFileKeyForRecipient - FileKey encrypted with recipient's public key
 */
export async function shareFile(
  fileId: string,
  recipientId: string,
  encryptedFileKeyForRecipient: { ciphertext: string; algorithm: string; version: number }
): Promise<ApiResponse<ShareFileResponse>> {
  return fetchApi<ShareFileResponse>(`/sharing/files/${fileId}/share`, {
    method: 'POST',
    body: JSON.stringify({
      recipientId,
      encryptedFileKeyForRecipient,
    }),
  });
}

/**
 * Unshare a file from a user
 */
export async function unshareFile(fileId: string, recipientId: string): Promise<ApiResponse<void>> {
  return fetchApi<void>(`/sharing/files/${fileId}/share/${recipientId}`, {
    method: 'DELETE',
  });
}

/**
 * Get files shared with current user
 */
export async function getFilesSharedWithMe(): Promise<ApiResponse<{ files: SharedFile[]; totalCount: number }>> {
  return fetchApi<{ files: SharedFile[]; totalCount: number }>('/sharing/shared/with-me');
}

/**
 * Get files current user has shared
 */
export async function getFilesSharedByMe(): Promise<ApiResponse<{ shares: SharedFile[]; totalCount: number }>> {
  return fetchApi<{ shares: SharedFile[]; totalCount: number }>('/sharing/shared/by-me');
}

/**
 * Get all shares for a specific file
 */
export async function getFileShares(fileId: string): Promise<ApiResponse<{ shares: SharedFile[] }>> {
  return fetchApi<{ shares: SharedFile[] }>(`/sharing/files/${fileId}/shares`);
}

/**
 * Get current user's encrypted private key (needed for decrypting shared files)
 */
export async function getMyEncryptedPrivateKey(): Promise<ApiResponse<{ encryptedPrivateKey: string; publicKey: string }>> {
  return fetchApi<{ encryptedPrivateKey: string; publicKey: string }>('/sharing/users/me/private-key');
}

// ============================================================================
// MFA API
// ============================================================================

/**
 * Get current MFA status
 */
export async function getMFAStatus(): Promise<ApiResponse<MFAStatus>> {
  return fetchApi<MFAStatus>('/mfa/status');
}

/**
 * Set up MFA with encrypted secret and hashed recovery codes
 */
export async function setupMFA(
  encryptedMfaSecret: EncryptedBlob,
  serverMfaSecret: string,
  recoveryCodesHash: string[],
  verificationCode: string
): Promise<ApiResponse<MFASetupResponse>> {
  return fetchApi<MFASetupResponse>('/mfa/setup', {
    method: 'POST',
    body: JSON.stringify({
      encryptedMfaSecret,
      serverMfaSecret,
      recoveryCodesHash,
      verificationCode,
    }),
  });
}

/**
 * Disable MFA
 */
export async function disableMFA(verificationCode: string): Promise<ApiResponse<{ success: boolean; message: string }>> {
  return fetchApi<{ success: boolean; message: string }>('/mfa/disable', {
    method: 'POST',
    body: JSON.stringify({ verificationCode }),
  });
}

/**
 * Verify MFA code (TOTP or recovery)
 */
export async function verifyMFA(
  code: string,
  isRecoveryCode: boolean = false
): Promise<ApiResponse<MFAVerifyResponse>> {
  return fetchApi<MFAVerifyResponse>('/mfa/verify', {
    method: 'POST',
    body: JSON.stringify({ code, isRecoveryCode }),
  });
}

/**
 * Get encrypted MFA secret (for TOTP generation during login)
 */
export async function getMFASecret(): Promise<ApiResponse<{ encryptedMfaSecret: EncryptedBlob }>> {
  return fetchApi<{ encryptedMfaSecret: EncryptedBlob }>('/mfa/secret');
}

// ============================================================================
// Folder API
// ============================================================================

export async function createFolder(
  encryptedName: EncryptedBlob,
  parentId?: string | null,
): Promise<ApiResponse<FolderResponse>> {
  return fetchApi<FolderResponse>('/folders/', {
    method: 'POST',
    body: JSON.stringify({ encryptedName, parentId: parentId ?? null }),
  });
}

export async function listFolders(parentId?: string | null): Promise<ApiResponse<FolderListResponse>> {
  const params = parentId ? `?parent_id=${encodeURIComponent(parentId)}` : '';
  return fetchApi<FolderListResponse>(`/folders/${params}`);
}

export async function getFolder(folderId: string): Promise<ApiResponse<FolderResponse>> {
  return fetchApi<FolderResponse>(`/folders/${folderId}`);
}

export async function renameFolder(folderId: string, encryptedName: EncryptedBlob): Promise<ApiResponse<FolderResponse>> {
  return fetchApi<FolderResponse>(`/folders/${folderId}`, {
    method: 'PATCH',
    body: JSON.stringify({ encryptedName }),
  });
}

export async function moveFolder(folderId: string, parentId: string | null): Promise<ApiResponse<FolderResponse>> {
  return fetchApi<FolderResponse>(`/folders/${folderId}/move`, {
    method: 'PATCH',
    body: JSON.stringify({ parentId }),
  });
}

export async function deleteFolder(folderId: string): Promise<ApiResponse<{ success: boolean }>> {
  return fetchApi<{ success: boolean }>(`/folders/${folderId}`, {
    method: 'DELETE',
  });
}

// ============================================================================
// Trash API
// ============================================================================

export async function listTrash(): Promise<ApiResponse<FileListResponse>> {
  return fetchApi<FileListResponse>('/files/trash/list');
}

export async function restoreFile(fileId: string): Promise<ApiResponse<unknown>> {
  return fetchApi<unknown>(`/files/${fileId}/restore`, { method: 'POST' });
}

// ============================================================================
// Versioning API
// ============================================================================

export async function listVersions(fileId: string): Promise<ApiResponse<FileVersionListResponse>> {
  return fetchApi<FileVersionListResponse>(`/files/${fileId}/versions`);
}

export async function downloadVersion(fileId: string, versionNumber: number): Promise<ApiResponse<Uint8Array>> {
  try {
    const response = await fetch(`${API_BASE}/files/${fileId}/versions/${versionNumber}/download`, {
      method: 'GET',
      credentials: 'include',
    });
    if (!response.ok) {
      const data = await response.json();
      return { success: false, error: data.detail || 'Download failed' };
    }
    const arrayBuffer = await response.arrayBuffer();
    return { success: true, data: new Uint8Array(arrayBuffer) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Download failed' };
  }
}

// ============================================================================
// File Move API
// ============================================================================

export async function moveFile(fileId: string, folderId: string | null): Promise<ApiResponse<unknown>> {
  const params = folderId ? `?folder_id=${encodeURIComponent(folderId)}` : '';
  return fetchApi<unknown>(`/files/${fileId}/move${params}`, { method: 'PATCH' });
}

// ============================================================================
// Link Sharing API
// ============================================================================

export async function createLink(
  fileId: string,
  encryptedFileKey: EncryptedBlob,
  encryptedFilename: EncryptedBlob,
  options?: { password?: string; expiresAt?: string; maxDownloads?: number },
): Promise<ApiResponse<SharedLinkResponse>> {
  return fetchApi<SharedLinkResponse>(`/links/files/${fileId}`, {
    method: 'POST',
    body: JSON.stringify({
      encryptedFileKey,
      encryptedFilename,
      password: options?.password,
      expiresAt: options?.expiresAt,
      maxDownloads: options?.maxDownloads,
    }),
  });
}

export async function listLinksForFile(fileId: string): Promise<ApiResponse<SharedLinkListResponse>> {
  return fetchApi<SharedLinkListResponse>(`/links/files/${fileId}`);
}

export async function listMyLinks(): Promise<ApiResponse<SharedLinkListResponse>> {
  return fetchApi<SharedLinkListResponse>('/links/my-links');
}

export async function revokeLink(token: string): Promise<ApiResponse<{ success: boolean }>> {
  return fetchApi<{ success: boolean }>(`/links/${token}`, { method: 'DELETE' });
}

export async function getLinkInfo(token: string): Promise<ApiResponse<SharedLinkPublicInfo>> {
  return fetchApi<SharedLinkPublicInfo>(`/links/public/${token}`);
}

export async function verifyLinkPassword(token: string, password: string): Promise<ApiResponse<{ valid: boolean }>> {
  return fetchApi<{ valid: boolean }>(`/links/public/${token}/verify-password`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export async function downloadViaLink(token: string): Promise<ApiResponse<Uint8Array>> {
  try {
    const response = await fetch(`${API_BASE}/links/public/${token}/download`, {
      method: 'GET',
      credentials: 'include',
    });
    if (!response.ok) {
      const data = await response.json();
      return { success: false, error: data.detail || 'Download failed' };
    }
    const arrayBuffer = await response.arrayBuffer();
    return { success: true, data: new Uint8Array(arrayBuffer) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Download failed' };
  }
}

// ============================================================================
// Audit API
// ============================================================================

export async function listAuditLog(params?: {
  action?: string;
  resourceType?: string;
  limit?: number;
  offset?: number;
}): Promise<ApiResponse<AuditListResponse>> {
  const searchParams = new URLSearchParams();
  if (params?.action) searchParams.set('action', params.action);
  if (params?.resourceType) searchParams.set('resource_type', params.resourceType);
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.offset) searchParams.set('offset', String(params.offset));
  const qs = searchParams.toString();
  return fetchApi<AuditListResponse>(`/audit/${qs ? `?${qs}` : ''}`);
}
