/**
 * Shared TypeScript types for the Vault application
 * 
 * Zero-Knowledge Authentication Model:
 * - Passwords never leave the browser
 * - Backend stores only encrypted data
 * - VaultKey lives in memory only during session
 */

// Re-export crypto types
export type {
  KdfParams,
  EncryptedBlob,
  ZKRegistrationData,
  ZKLoginChallenge,
} from '@/lib/crypto/types';

// User type - represents authenticated user in frontend state
export interface User {
  id: string;
  email: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  createdAt: string;
}

// Auth state managed by React Context
export interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** VaultKey is held in memory only - NEVER persisted */
  hasVaultKey: boolean;
  /** True when user has session but needs to enter password to unlock VaultKey */
  needsUnlock: boolean;
}

// API response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Session info returned after login/register
export interface SessionInfo {
  user: User;
  sessionId: string;
}

// ============================================================================
// File Types - Zero-Knowledge Encrypted File Storage
// ============================================================================

// Encrypted blob format (same structure as crypto types)
export interface EncryptedBlobData {
  ciphertext: string;
  algorithm: string;
  version: number;
}

// File metadata returned from API (encrypted - client must decrypt)
export interface EncryptedFileMetadata {
  id: string;
  encryptedFileKey: EncryptedBlobData;
  encryptedFilename: EncryptedBlobData;
  encryptedMimeType: EncryptedBlobData | null;
  encryptedSize: number;
  folderId: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// File list response from API
export interface FileListResponse {
  files: EncryptedFileMetadata[];
  totalCount: number;
}

// File upload response
export interface FileUploadResponse {
  fileId: string;
  encryptedSize: number;
  createdAt: string;
}

// File delete response
export interface FileDeleteResponse {
  success: boolean;
  fileId: string;
}

// Decrypted file for display in UI
export interface DecryptedFile {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  folderId: string | null;
  deletedAt: string | null;
  createdAt: string;
  // Keep encrypted data for download
  encryptedFileKey: EncryptedBlobData;
}

// ============================================================================
// Folder Types
// ============================================================================

export interface FolderResponse {
  id: string;
  parentId: string | null;
  encryptedName: EncryptedBlobData;
  createdAt: string;
  updatedAt: string;
}

export interface FolderListResponse {
  folders: FolderResponse[];
  totalCount: number;
}

export interface DecryptedFolder {
  id: string;
  parentId: string | null;
  name: string;
  createdAt: string;
}

// ============================================================================
// Version Types
// ============================================================================

export interface FileVersionInfo {
  id: string;
  versionNumber: number;
  encryptedFileKey: EncryptedBlobData;
  encryptedSize: number;
  createdAt: string;
}

export interface FileVersionListResponse {
  versions: FileVersionInfo[];
  totalCount: number;
}

// ============================================================================
// Sharing Types - Envelope Encryption
// ============================================================================

// User info for sharing (public data only)
export interface UserPublicInfo {
  id: string;
  email: string;
  publicKey: string;
}

// Shared file info (from /shared/with-me or /shared/by-me)
export interface SharedFile {
  shareId: string;
  fileId: string;
  encryptedFilename: EncryptedBlobData;
  encryptedMimeType: EncryptedBlobData | null;
  encryptedSize: number;
  ownerId: string;
  ownerEmail: string;
  recipientId: string;
  recipientEmail: string;
  encryptedFileKeyForRecipient: EncryptedBlobData;
  sharedAt: string;
}

// Decrypted shared file for display
export interface DecryptedSharedFile {
  shareId: string;
  fileId: string;
  filename: string;
  mimeType: string;
  size: number;
  ownerId: string;
  ownerEmail: string;
  recipientId: string;
  recipientEmail: string;
  sharedAt: string;
  // Keep encrypted FileKey for download
  encryptedFileKeyForRecipient: EncryptedBlobData;
}

// Share file response
export interface ShareFileResponse {
  shareId: string;
  fileId: string;
  recipientId: string;
  recipientEmail: string;
  sharedAt: string;
}

// ============================================================================
// Link Sharing Types
// ============================================================================

export interface SharedLinkResponse {
  id: string;
  token: string;
  fileId: string;
  passwordProtected: boolean;
  expiresAt: string | null;
  maxDownloads: number | null;
  downloadCount: number;
  isActive: boolean;
  createdAt: string;
}

export interface SharedLinkListResponse {
  links: SharedLinkResponse[];
  totalCount: number;
}

export interface SharedLinkPublicInfo {
  token: string;
  encryptedFilename: EncryptedBlobData;
  encryptedFileKey: EncryptedBlobData;
  passwordRequired: boolean;
  expiresAt: string | null;
  maxDownloads: number | null;
  downloadCount: number;
}

// ============================================================================
// Audit Types
// ============================================================================

export interface AuditLogEntry {
  id: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface AuditListResponse {
  entries: AuditLogEntry[];
  totalCount: number;
}

// ============================================================================
// MFA Types - Zero-Knowledge Two-Factor Authentication
// ============================================================================

// MFA status response
export interface MFAStatus {
  mfaEnabled: boolean;
  hasRecoveryCodes: boolean;
}

// MFA setup response
export interface MFASetupResponse {
  success: boolean;
  message: string;
  recoveryCodesCount: number;
}

// MFA verify response
export interface MFAVerifyResponse {
  verified: boolean;
  message: string;
  recoveryCodeUsed?: boolean;
  remainingRecoveryCodes?: number;
}

