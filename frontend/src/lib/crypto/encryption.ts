/**
 * Symmetric Encryption using XChaCha20-Poly1305
 * 
 * SECURITY CRITICAL: This module handles all symmetric encryption.
 * Uses libsodium's XChaCha20-Poly1305 AEAD cipher.
 * 
 * XChaCha20-Poly1305 provides:
 * - 256-bit key security
 * - 192-bit nonces (safe for random generation)
 * - Authenticated encryption (integrity + confidentiality)
 */

import sodium from 'libsodium-wrappers';
import type { EncryptedBlob, CryptoResult } from './types';
import { CRYPTO_CONSTANTS } from './types';
import { bytesToBase64, base64ToBytes, clearSensitiveData } from './kdf';

// Ensure sodium is initialized
let sodiumReady = false;

/**
 * Initialize libsodium. Must be called before any crypto operations.
 * Safe to call multiple times.
 */
export async function initCrypto(): Promise<void> {
  if (!sodiumReady) {
    await sodium.ready;
    sodiumReady = true;
  }
}

/**
 * Encrypt data using XChaCha20-Poly1305.
 * 
 * SECURITY NOTES:
 * - Nonce is randomly generated (safe with 192-bit nonces)
 * - Output format: nonce || ciphertext (ciphertext includes auth tag)
 * - Key should be cleared from memory after use
 * 
 * @param plaintext - Data to encrypt (Uint8Array)
 * @param key - 256-bit encryption key
 * @returns EncryptedBlob ready for storage/transmission
 */
export async function encrypt(
  plaintext: Uint8Array,
  key: Uint8Array
): Promise<CryptoResult<EncryptedBlob>> {
  try {
    await initCrypto();
    
    // Validate key length
    if (key.length !== CRYPTO_CONSTANTS.KEY_LENGTH) {
      return {
        success: false,
        error: `Key must be ${CRYPTO_CONSTANTS.KEY_LENGTH} bytes`,
      };
    }
    
    // Generate random nonce (24 bytes for XChaCha20)
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
    
    // Encrypt with XChaCha20-Poly1305
    // crypto_secretbox automatically appends the Poly1305 auth tag
    const ciphertext = sodium.crypto_secretbox_easy(plaintext, nonce, key);
    
    // Combine nonce + ciphertext for storage
    const combined = new Uint8Array(nonce.length + ciphertext.length);
    combined.set(nonce);
    combined.set(ciphertext, nonce.length);
    
    return {
      success: true,
      data: {
        ciphertext: bytesToBase64(combined),
        algorithm: 'xchacha20-poly1305',
        version: 1,
      },
    };
    
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Encryption failed',
    };
  }
}

/**
 * Decrypt data encrypted with XChaCha20-Poly1305.
 * 
 * SECURITY NOTES:
 * - Authenticates ciphertext before decryption (AEAD)
 * - Returns error if authentication fails (tampered data)
 * - Decrypted data should be cleared from memory when no longer needed
 * 
 * @param blob - EncryptedBlob to decrypt
 * @param key - 256-bit decryption key
 * @returns Decrypted plaintext or error
 */
export async function decrypt(
  blob: EncryptedBlob,
  key: Uint8Array
): Promise<CryptoResult<Uint8Array>> {
  try {
    await initCrypto();
    
    // Validate algorithm
    if (blob.algorithm !== 'xchacha20-poly1305') {
      return {
        success: false,
        error: `Unsupported algorithm: ${blob.algorithm}`,
      };
    }
    
    // Validate key length
    if (key.length !== CRYPTO_CONSTANTS.KEY_LENGTH) {
      return {
        success: false,
        error: `Key must be ${CRYPTO_CONSTANTS.KEY_LENGTH} bytes`,
      };
    }
    
    // Decode combined data
    const combined = base64ToBytes(blob.ciphertext);
    
    // Extract nonce and ciphertext
    const nonceLength = sodium.crypto_secretbox_NONCEBYTES;
    if (combined.length < nonceLength + sodium.crypto_secretbox_MACBYTES) {
      return {
        success: false,
        error: 'Invalid ciphertext: too short',
      };
    }
    
    const nonce = combined.slice(0, nonceLength);
    const ciphertext = combined.slice(nonceLength);
    
    // Decrypt and verify authentication tag
    // crypto_secretbox_open_easy returns false/throws if auth fails
    const plaintext = sodium.crypto_secretbox_open_easy(ciphertext, nonce, key);
    
    return { success: true, data: plaintext };
    
  } catch (error) {
    // Authentication failure or other decryption error
    // SECURITY: Don't reveal specific error details to prevent oracle attacks
    return {
      success: false,
      error: 'Decryption failed - invalid key or corrupted data',
    };
  }
}

/**
 * Encrypt a VaultKey with a KEK for storage.
 * 
 * @param vaultKey - The VaultKey to encrypt
 * @param kek - Key Encryption Key derived from password
 * @returns EncryptedBlob containing the wrapped VaultKey
 */
export async function encryptVaultKey(
  vaultKey: Uint8Array,
  kek: Uint8Array
): Promise<CryptoResult<EncryptedBlob>> {
  return encrypt(vaultKey, kek);
}

/**
 * Decrypt a VaultKey using a KEK.
 * 
 * SECURITY: This is the core of zero-knowledge authentication.
 * If decryption succeeds, the password was correct.
 * If it fails, the password was wrong (no information leaked).
 * 
 * @param encryptedVaultKey - EncryptedBlob from backend
 * @param kek - Key Encryption Key derived from password
 * @returns Decrypted VaultKey or error
 */
export async function decryptVaultKey(
  encryptedVaultKey: EncryptedBlob,
  kek: Uint8Array
): Promise<CryptoResult<Uint8Array>> {
  return decrypt(encryptedVaultKey, kek);
}

/**
 * Encrypt a FileKey with the VaultKey for storage.
 * 
 * @param fileKey - Per-file encryption key
 * @param vaultKey - User's VaultKey
 * @returns EncryptedBlob containing the wrapped FileKey
 */
export async function encryptFileKey(
  fileKey: Uint8Array,
  vaultKey: Uint8Array
): Promise<CryptoResult<EncryptedBlob>> {
  return encrypt(fileKey, vaultKey);
}

/**
 * Decrypt a FileKey using the VaultKey.
 * 
 * @param encryptedFileKey - EncryptedBlob from backend
 * @param vaultKey - User's VaultKey
 * @returns Decrypted FileKey or error
 */
export async function decryptFileKey(
  encryptedFileKey: EncryptedBlob,
  vaultKey: Uint8Array
): Promise<CryptoResult<Uint8Array>> {
  return decrypt(encryptedFileKey, vaultKey);
}
