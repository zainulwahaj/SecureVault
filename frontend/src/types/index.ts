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
  authLevel?: 'pending_mfa' | 'full';
  mfaRequired?: boolean;
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


export interface SessionDevice {
  sessionIdHash: string;
  authLevel: 'pending_mfa' | 'full' | string;
  createdAt: string | null;
  lastSeenAt: string | null;
  mfaVerifiedAt: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  current: boolean;
}

export interface SessionListResponse {
  sessions: SessionDevice[];
  totalCount: number;
}

export interface RevokeSessionsResponse {
  revokedCount: number;
}

// Session info returned after login/register
export interface SessionInfo {
  user: User;
  sessionId: string;
  authLevel: 'pending_mfa' | 'full';
  mfaRequired: boolean;
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


export interface ChunkManifestPart {
  partNumber: number;
  storagePath?: string;
  encryptedSize: number;
  encryptedSha256?: string;
  plainSize?: number;
}

export interface ChunkManifest {
  version?: number;
  storageMode?: 'chunked' | string;
  chunkSize?: number;
  totalParts?: number;
  encryptedSize?: number;
  clientManifest?: Record<string, unknown>;
  parts: ChunkManifestPart[];
}

// File metadata returned from API (encrypted - client must decrypt)
export interface EncryptedFileMetadata {
  id: string;
  encryptedFileKey: EncryptedBlobData;
  encryptedFilename: EncryptedBlobData;
  encryptedMimeType: EncryptedBlobData | null;
  encryptedSize: number;
  encryptedSha256?: string | null;
  storageMode: "single" | "chunked" | string;
  chunkManifest?: ChunkManifest | null;
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
  encryptedSha256?: string | null;
  storageMode: "single" | "chunked" | string;
  createdAt: string;
}

export interface FileUploadSessionResponse {
  uploadId: string;
  fileId: string;
  status: string;
  receivedParts: number[];
  totalParts: number;
  chunkSize: number;
}

export interface FileUploadPartResponse {
  uploadId: string;
  partNumber: number;
  encryptedSize: number;
  encryptedSha256: string;
}

export interface StorageUsage {
  usedBytes: number;
  fileBytes: number;
  versionBytes: number;
  fileCount: number;
  maxStorageBytes: number;
  maxFileSizeBytes: number;
  maxFileCount: number;
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
  storageMode?: "single" | "chunked" | string;
  chunkManifest?: ChunkManifest | null;
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
  encryptedSha256?: string | null;
  createdAt: string;
}

export interface FileVersionListResponse {
  versions: FileVersionInfo[];
  totalCount: number;
}

// ============================================================================
// Sharing Types - Envelope Encryption
// ============================================================================


export interface DeviceKeyInfo {
  id: string;
  deviceLabel?: string | null;
  encryptionPublicKey: string;
  signingPublicKey?: string | null;
  fingerprint: string;
  createdAt: string;
}

// User info for sharing (public data only)
export interface UserPublicInfo {
  id: string;
  email: string;
  publicKey: string;
  publicKeyId?: string | null;
  publicKeyFingerprint?: string | null;
  deviceKeys?: DeviceKeyInfo[];
}

// Shared file info (from /shared/with-me or /shared/by-me)
export interface SharedFile {
  shareId: string;
  fileId: string;
  encryptedFilename: EncryptedBlobData;
  encryptedMimeType: EncryptedBlobData | null;
  encryptedSize: number;
  storageMode: "single" | "chunked" | string;
  chunkManifest?: ChunkManifest | null;
  ownerId: string;
  ownerEmail: string;
  recipientId: string;
  recipientEmail: string;
  encryptedFileKeyForRecipient: EncryptedBlobData;
  encryptedFileKeyForOwner?: EncryptedBlobData | null;
  permission: string;
  expiresAt: string | null;
  revokedAt: string | null;
  publicKeyFingerprint?: string | null;
  envelopeCount?: number;
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
  permission: string;
  expiresAt: string | null;
  revokedAt: string | null;
  publicKeyFingerprint?: string | null;
  // Keep encrypted FileKey for download
  encryptedFileKeyForRecipient: EncryptedBlobData;
  storageMode: "single" | "chunked" | string;
  chunkManifest?: ChunkManifest | null;
}

export interface DecryptedSharedByMe extends SharedFile {
  filename: string;
  mimeType: string;
  size: number;
}

export interface FileShareInfo {
  recipientId: string;
  recipientEmail: string;
  permission: string;
  publicKeyFingerprint?: string | null;
  sharedAt: string;
}

// Share file response
export interface ShareFileResponse {
  shareId: string;
  fileId: string;
  recipientId: string;
  recipientEmail: string;
  permission: string;
  publicKeyFingerprint?: string | null;
  sharedAt: string;
}

// ============================================================================
// Link Sharing Types
// ============================================================================

export interface SharedLinkResponse {
  id: string;
  token: string;
  fileId: string;
  encryptedFilename?: EncryptedBlobData | null;
  encryptedMimeType?: EncryptedBlobData | null;
  encryptedFileKey?: EncryptedBlobData | null;
  encryptedSize?: number | null;
  storageMode?: "single" | "chunked" | string;
  chunkManifest?: ChunkManifest | null;
  passwordProtected: boolean;
  expiresAt: string | null;
  maxDownloads: number | null;
  downloadCount: number;
  isActive: boolean;
  createdAt: string;
}

export interface DecryptedSharedLink extends SharedLinkResponse {
  filename: string;
  mimeType: string;
  size: number;
}

export interface SharedLinkListResponse {
  links: SharedLinkResponse[];
  totalCount: number;
}

export interface SharedLinkPublicInfo {
  token: string;
  encryptedFilename: EncryptedBlobData | null;
  encryptedFileKey: EncryptedBlobData | null;
  storageMode?: "single" | "chunked" | string;
  chunkManifest?: ChunkManifest | null;
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
  category: string;
  outcome: 'success' | 'failure' | string;
  severity: 'info' | 'warning' | 'error' | string;
  resourceType: string | null;
  resourceId: string | null;
  details: Record<string, unknown> | null;
  requestId: string | null;
  sessionIdHash: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  sequenceNumber: number | null;
  prevHash: string | null;
  eventHash: string | null;
  hashVersion: string;
  createdAt: string;
}

export interface AuditListResponse {
  entries: AuditLogEntry[];
  totalCount: number;
}

export interface AuditIntegrityResponse {
  valid: boolean;
  checkedCount: number;
  failedEntryId: string | null;
  reason: string | null;
}

// ============================================================================
// MFA Types - Zero-Knowledge Two-Factor Authentication
// ============================================================================

// MFA status response
export interface MFAStatus {
  mfaEnabled: boolean;
  encryptedMfaSecret?: EncryptedBlobData | null;
  recoveryCodesRemaining: number;
}

// MFA setup response
export interface MFASetupResponse {
  success: boolean;
  message: string;
  mfaEnabled: boolean;
}

// MFA verify response
export interface MFAVerifyResponse {
  success: boolean;
  verified: boolean;
  message: string;
  recoveryCodesRemaining?: number;
}
