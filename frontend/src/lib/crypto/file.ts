/**
 * File Encryption Module - Encrypted File Storage
 * 
 * SECURITY CRITICAL: This module handles all file encryption.
 * Uses libsodium secretstream for streaming encryption of large files.
 * 
 * KEY HIERARCHY:
 * 1. VaultKey (user's master key, from auth)
 * 2. FileKey (random per-file, encrypted with VaultKey)
 * 3. FileKey encrypts: file content, filename, mimetype
 * 
 * ALGORITHMS:
 * - File content: XChaCha20-Poly1305 (via secretbox for simplicity)
 * - FileKey wrapping: XChaCha20-Poly1305 (via encrypt/decrypt)
 * - Filename/metadata: XChaCha20-Poly1305
 */

import sodium from 'libsodium-wrappers';
import type { EncryptedBlob, CryptoResult, FileKey, VaultKey } from './types';
import { CRYPTO_CONSTANTS } from './types';
import { clearSensitiveData } from './kdf';
import { initCrypto, encrypt, decrypt, encryptFileKey, decryptFileKey } from './encryption';
import {
  workerEncryptChunk,
  workerDecryptChunk,
  workerDecryptManifest,
  shouldUseWorker,
} from './workerClient';

// Re-export these for convenience
export { encryptFileKey, decryptFileKey } from './encryption';

/**
 * Generate a random FileKey for encrypting a file.
 * 
 * SECURITY:
 * - Each file gets a unique random key
 * - FileKey is encrypted with VaultKey before storage
 * - Enables secure file sharing via envelope encryption later
 */
export function generateFileKey(): FileKey {
  return sodium.randombytes_buf(CRYPTO_CONSTANTS.KEY_LENGTH);
}

/**
 * Encrypt file content with FileKey.
 * 
 * Uses XChaCha20-Poly1305 for authenticated encryption.
 * For large files, content is processed in chunks but still uses
 * the secretbox API (suitable for files up to several hundred MB).
 * 
 * SECURITY:
 * - Random nonce per encryption
 * - AEAD (authenticated encryption with associated data)
 * - Ciphertext cannot be modified without detection
 * 
 * @param content - File content as Uint8Array
 * @param fileKey - Per-file encryption key
 * @returns Encrypted content with nonce prepended
 */
export async function encryptFileContent(
  content: Uint8Array,
  fileKey: FileKey
): Promise<CryptoResult<Uint8Array>> {
  try {
    // Validate key
    if (fileKey.length !== CRYPTO_CONSTANTS.KEY_LENGTH) {
      return {
        success: false,
        error: `FileKey must be ${CRYPTO_CONSTANTS.KEY_LENGTH} bytes`,
      };
    }

    // Offload large payloads to the Web Worker so the UI thread stays responsive.
    if (shouldUseWorker(content.length)) {
      const workerResult = await workerEncryptChunk(content, fileKey);
      if (workerResult.success) return workerResult;
      // Fall back to inline crypto if the worker is unavailable.
    }

    await initCrypto();
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
    const ciphertext = sodium.crypto_secretbox_easy(content, nonce, fileKey);
    const combined = new Uint8Array(nonce.length + ciphertext.length);
    combined.set(nonce);
    combined.set(ciphertext, nonce.length);
    return { success: true, data: combined };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'File encryption failed',
    };
  }
}

/**
 * Decrypt file content with FileKey.
 * 
 * @param encryptedContent - Encrypted content (nonce + ciphertext)
 * @param fileKey - Per-file encryption key
 * @returns Decrypted file content
 */
export async function decryptFileContent(
  encryptedContent: Uint8Array,
  fileKey: FileKey
): Promise<CryptoResult<Uint8Array>> {
  try {
    if (fileKey.length !== CRYPTO_CONSTANTS.KEY_LENGTH) {
      return {
        success: false,
        error: `FileKey must be ${CRYPTO_CONSTANTS.KEY_LENGTH} bytes`,
      };
    }

    if (shouldUseWorker(encryptedContent.length)) {
      const workerResult = await workerDecryptChunk(encryptedContent, fileKey);
      if (workerResult.success) return workerResult;
      // Fall through to inline path on worker failure.
    }

    await initCrypto();
    const nonceLength = sodium.crypto_secretbox_NONCEBYTES;
    if (encryptedContent.length < nonceLength + sodium.crypto_secretbox_MACBYTES) {
      return {
        success: false,
        error: 'Invalid encrypted content: too short',
      };
    }
    const nonce = encryptedContent.slice(0, nonceLength);
    const ciphertext = encryptedContent.slice(nonceLength);
    const plaintext = sodium.crypto_secretbox_open_easy(ciphertext, nonce, fileKey);
    return { success: true, data: plaintext };

  } catch {
    return {
      success: false,
      error: 'File decryption failed - invalid key or corrupted data',
    };
  }
}

/**
 * Encrypt a string (filename, mimetype) with FileKey.
 * 
 * @param text - String to encrypt
 * @param fileKey - Per-file encryption key
 * @returns EncryptedBlob
 */
export async function encryptMetadata(
  text: string,
  fileKey: FileKey
): Promise<CryptoResult<EncryptedBlob>> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  return encrypt(data, fileKey);
}

/**
 * Decrypt an encrypted string (filename, mimetype) with FileKey.
 * 
 * @param blob - EncryptedBlob to decrypt
 * @param fileKey - Per-file encryption key
 * @returns Decrypted string
 */
export async function decryptMetadata(
  blob: EncryptedBlob,
  fileKey: FileKey
): Promise<CryptoResult<string>> {
  const result = await decrypt(blob, fileKey);
  if (!result.success || !result.data) {
    return { success: false, error: result.error };
  }
  
  const decoder = new TextDecoder();
  return { success: true, data: decoder.decode(result.data) };
}

/**
 * Decrypt filename with FileKey.
 * Convenience wrapper around decryptMetadata.
 */
export async function decryptFilename(
  encryptedFilename: EncryptedBlob,
  fileKey: FileKey
): Promise<CryptoResult<string>> {
  return decryptMetadata(encryptedFilename, fileKey);
}

/**
 * Decrypt MIME type with FileKey.
 * Convenience wrapper around decryptMetadata.
 */
export async function decryptMimeType(
  encryptedMimeType: EncryptedBlob,
  fileKey: FileKey
): Promise<CryptoResult<string>> {
  return decryptMetadata(encryptedMimeType, fileKey);
}

// ============================================================================
// High-Level File Operations
// ============================================================================

/**
 * Encrypted file data ready for upload.
 */
export interface EncryptedFileData {
  /** Encrypted file content (raw bytes) */
  encryptedContent: Uint8Array;
  /** FileKey encrypted with VaultKey */
  encryptedFileKey: EncryptedBlob;
  /** Original filename encrypted with FileKey */
  encryptedFilename: EncryptedBlob;
  /** MIME type encrypted with FileKey */
  encryptedMimeType: EncryptedBlob;
}

export interface ChunkedFileUploadContext {
  fileKey: FileKey;
  encryptedFileKey: EncryptedBlob;
  encryptedFilename: EncryptedBlob;
  encryptedMimeType: EncryptedBlob;
}

export interface ChunkManifestPart {
  partNumber: number;
  encryptedSize: number;
  encryptedSha256?: string;
  plainSize?: number;
}

export interface ChunkManifest {
  storageMode?: string;
  chunkSize?: number;
  totalParts?: number;
  encryptedSize?: number;
  parts: ChunkManifestPart[];
}

/**
 * Prepare a file for encrypted upload.
 * 
 * This function:
 * 1. Generates random FileKey
 * 2. Encrypts file content with FileKey
 * 3. Encrypts FileKey with VaultKey
 * 4. Encrypts filename with FileKey
 * 5. Encrypts MIME type with FileKey
 * 
 * SECURITY:
 * - FileKey is unique per file
 * - VaultKey never leaves memory
 * - All data is encrypted before leaving this function
 * 
 * @param file - File object from input
 * @param vaultKey - User's VaultKey (from session)
 * @returns Encrypted data ready for upload
 */
export async function prepareChunkedFileForUpload(
  file: File,
  vaultKey: VaultKey
): Promise<CryptoResult<ChunkedFileUploadContext>> {
  try {
    await initCrypto();
    const fileKey = generateFileKey();

    const keyResult = await encryptFileKey(fileKey, vaultKey);
    if (!keyResult.success || !keyResult.data) return { success: false, error: keyResult.error };

    const filenameResult = await encryptMetadata(file.name, fileKey);
    if (!filenameResult.success || !filenameResult.data) return { success: false, error: filenameResult.error };

    const mimeResult = await encryptMetadata(file.type || 'application/octet-stream', fileKey);
    if (!mimeResult.success || !mimeResult.data) return { success: false, error: mimeResult.error };

    return {
      success: true,
      data: {
        fileKey,
        encryptedFileKey: keyResult.data,
        encryptedFilename: filenameResult.data,
        encryptedMimeType: mimeResult.data,
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to prepare chunked upload' };
  }
}

export async function prepareFileForUpload(
  file: File,
  vaultKey: VaultKey
): Promise<CryptoResult<EncryptedFileData>> {
  let fileKey: FileKey | null = null;
  
  try {
    await initCrypto();
    
    // Step 1: Generate random FileKey
    fileKey = generateFileKey();
    
    // Step 2: Read and encrypt file content
    const content = new Uint8Array(await file.arrayBuffer());
    const contentResult = await encryptFileContent(content, fileKey);
    if (!contentResult.success || !contentResult.data) {
      return { success: false, error: contentResult.error };
    }
    
    // Step 3: Encrypt FileKey with VaultKey
    const keyResult = await encryptFileKey(fileKey, vaultKey);
    if (!keyResult.success || !keyResult.data) {
      return { success: false, error: keyResult.error };
    }
    
    // Step 4: Encrypt filename with FileKey
    const filenameResult = await encryptMetadata(file.name, fileKey);
    if (!filenameResult.success || !filenameResult.data) {
      return { success: false, error: filenameResult.error };
    }
    
    // Step 5: Encrypt MIME type with FileKey
    const mimeResult = await encryptMetadata(file.type || 'application/octet-stream', fileKey);
    if (!mimeResult.success || !mimeResult.data) {
      return { success: false, error: mimeResult.error };
    }
    
    return {
      success: true,
      data: {
        encryptedContent: contentResult.data,
        encryptedFileKey: keyResult.data,
        encryptedFilename: filenameResult.data,
        encryptedMimeType: mimeResult.data,
      },
    };
    
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to prepare file',
    };
  } finally {
    // Clear FileKey from memory
    if (fileKey) {
      clearSensitiveData(fileKey);
    }
  }
}

/**
 * Decrypted file metadata.
 */
export interface DecryptedFileMetadata {
  filename: string;
  mimeType: string;
}

/**
 * Decrypt file metadata (filename and MIME type).
 * 
 * @param encryptedFileKey - FileKey encrypted with VaultKey
 * @param encryptedFilename - Filename encrypted with FileKey
 * @param encryptedMimeType - MIME type encrypted with FileKey (optional)
 * @param vaultKey - User's VaultKey
 * @returns Decrypted filename and MIME type
 */
export async function decryptFileMetadata(
  encryptedFileKey: EncryptedBlob,
  encryptedFilename: EncryptedBlob,
  encryptedMimeType: EncryptedBlob | null,
  vaultKey: VaultKey
): Promise<CryptoResult<DecryptedFileMetadata>> {
  let fileKey: FileKey | null = null;
  
  try {
    await initCrypto();
    
    // Step 1: Decrypt FileKey with VaultKey
    const keyResult = await decryptFileKey(encryptedFileKey, vaultKey);
    if (!keyResult.success || !keyResult.data) {
      return { success: false, error: keyResult.error };
    }
    fileKey = keyResult.data;
    
    // Step 2: Decrypt filename with FileKey
    const filenameResult = await decryptMetadata(encryptedFilename, fileKey);
    if (!filenameResult.success || !filenameResult.data) {
      return { success: false, error: filenameResult.error };
    }
    
    // Step 3: Decrypt MIME type with FileKey (if provided)
    let mimeType = 'application/octet-stream';
    if (encryptedMimeType) {
      const mimeResult = await decryptMetadata(encryptedMimeType, fileKey);
      if (mimeResult.success && mimeResult.data) {
        mimeType = mimeResult.data;
      }
    }
    
    return {
      success: true,
      data: {
        filename: filenameResult.data,
        mimeType,
      },
    };
    
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to decrypt metadata',
    };
  } finally {
    // Clear FileKey from memory
    if (fileKey) {
      clearSensitiveData(fileKey);
    }
  }
}

/**
 * Decrypt downloaded file content.
 * 
 * @param encryptedContent - Encrypted file bytes from server
 * @param encryptedFileKey - FileKey encrypted with VaultKey
 * @param vaultKey - User's VaultKey
 * @returns Decrypted file content
 */
export async function decryptFileContentWithManifest(
  encryptedContent: Uint8Array,
  fileKey: FileKey,
  manifest?: ChunkManifest | null
): Promise<CryptoResult<Uint8Array>> {
  if (!manifest || manifest.storageMode !== 'chunked') {
    return decryptFileContent(encryptedContent, fileKey);
  }

  // Hand the whole manifest to the worker in one shot when possible.
  if (shouldUseWorker(encryptedContent.length) && Array.isArray(manifest.parts)) {
    const workerResult = await workerDecryptManifest(
      encryptedContent,
      fileKey,
      manifest.parts.map((p) => ({ encryptedSize: p.encryptedSize })),
    );
    if (workerResult.success) return workerResult;
  }

  try {
    const plaintextParts: Uint8Array[] = [];
    let offset = 0;
    for (const part of manifest.parts || []) {
      const encryptedSize = part.encryptedSize;
      if (!Number.isFinite(encryptedSize) || encryptedSize <= 0) {
        return { success: false, error: 'Invalid chunk manifest' };
      }
      const end = offset + encryptedSize;
      if (end > encryptedContent.length) {
        return { success: false, error: 'Chunk manifest exceeds encrypted content length' };
      }
      const decrypted = await decryptFileContent(encryptedContent.slice(offset, end), fileKey);
      if (!decrypted.success || !decrypted.data) {
        return { success: false, error: decrypted.error || 'Chunk decryption failed' };
      }
      plaintextParts.push(decrypted.data);
      offset = end;
    }
    if (offset !== encryptedContent.length) {
      return { success: false, error: 'Encrypted content has bytes outside the chunk manifest' };
    }
    const total = plaintextParts.reduce((sum, part) => sum + part.length, 0);
    const combined = new Uint8Array(total);
    let writeOffset = 0;
    for (const part of plaintextParts) {
      combined.set(part, writeOffset);
      writeOffset += part.length;
    }
    return { success: true, data: combined };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Chunked file decryption failed' };
  }
}

export async function decryptDownloadedFile(
  encryptedContent: Uint8Array,
  encryptedFileKey: EncryptedBlob,
  vaultKey: VaultKey,
  manifest?: ChunkManifest | null
): Promise<CryptoResult<Uint8Array>> {
  let fileKey: FileKey | null = null;
  
  try {
    await initCrypto();
    
    // Step 1: Decrypt FileKey with VaultKey
    const keyResult = await decryptFileKey(encryptedFileKey, vaultKey);
    if (!keyResult.success || !keyResult.data) {
      return { success: false, error: keyResult.error };
    }
    fileKey = keyResult.data;
    
    // Step 2: Decrypt file content with FileKey
    const contentResult = await decryptFileContentWithManifest(encryptedContent, fileKey, manifest);
    if (!contentResult.success || !contentResult.data) {
      return { success: false, error: contentResult.error };
    }
    
    return { success: true, data: contentResult.data };
    
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to decrypt file',
    };
  } finally {
    // Clear FileKey from memory
    if (fileKey) {
      clearSensitiveData(fileKey);
    }
  }
}
