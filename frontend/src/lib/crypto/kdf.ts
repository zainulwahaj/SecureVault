/**
 * Key Derivation Functions
 * 
 * SECURITY CRITICAL: This module derives encryption keys from passwords.
 * Uses WebCrypto API for PBKDF2-SHA256 as specified in the security model.
 * 
 * KEY HIERARCHY:
 * Password + Salt → PBKDF2 → KEK (Key Encryption Key)
 * KEK encrypts VaultKey, which encrypts FileKeys
 */

import type { KdfParams, KEK, CryptoResult } from './types';
import { DEFAULT_KDF_PARAMS, CRYPTO_CONSTANTS } from './types';

/**
 * Derive a Key Encryption Key (KEK) from a password and salt.
 * 
 * SECURITY NOTES:
 * - Uses PBKDF2-SHA256 with high iteration count
 * - Salt MUST be random and unique per user
 * - KEK should be cleared from memory immediately after use
 * - NEVER store the KEK - re-derive it when needed
 * 
 * @param password - User's password (will be encoded to UTF-8)
 * @param salt - Random salt (Uint8Array or base64 string)
 * @param params - KDF parameters (optional, uses defaults)
 * @returns Promise<CryptoResult<KEK>> - Derived key or error
 */
export async function deriveKEK(
  password: string,
  salt: Uint8Array | string,
  params: KdfParams = DEFAULT_KDF_PARAMS
): Promise<CryptoResult<KEK>> {
  try {
    // Convert salt from base64 if string
    const saltBytes = typeof salt === 'string' 
      ? base64ToBytes(salt) 
      : salt;
    
    // Validate salt length
    if (saltBytes.length < CRYPTO_CONSTANTS.SALT_LENGTH) {
      return {
        success: false,
        error: `Salt must be at least ${CRYPTO_CONSTANTS.SALT_LENGTH} bytes`,
      };
    }
    
    // Encode password to bytes
    const encoder = new TextEncoder();
    const passwordBytes = encoder.encode(password);
    
    // Import password as CryptoKey for PBKDF2
    const passwordKey = await crypto.subtle.importKey(
      'raw',
      passwordBytes,
      'PBKDF2',
      false, // not extractable
      ['deriveBits']
    );
    
    // Derive key bits using PBKDF2-SHA256
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: saltBytes as BufferSource,
        iterations: params.iterations,
        hash: 'SHA-256',
      },
      passwordKey,
      params.keyLength * 8 // bits, not bytes
    );
    
    // Convert to Uint8Array
    const kek = new Uint8Array(derivedBits);
    
    /**
     * SECURITY: Best-effort memory clearing of password bytes.
     * Note: JavaScript cannot guarantee memory clearing due to GC,
     * but this reduces the window of exposure.
     */
    passwordBytes.fill(0);
    
    return { success: true, data: kek };
    
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Key derivation failed',
    };
  }
}

/**
 * Generate a cryptographically random salt for KDF.
 * 
 * SECURITY: Uses crypto.getRandomValues for cryptographic randomness.
 * Salt must be stored alongside encrypted data for re-derivation.
 * 
 * @returns Uint8Array - Random salt bytes
 */
export function generateSalt(): Uint8Array {
  const salt = new Uint8Array(CRYPTO_CONSTANTS.SALT_LENGTH);
  crypto.getRandomValues(salt);
  return salt;
}

/**
 * Generate a random VaultKey.
 * 
 * SECURITY:
 * - Generated once during registration
 * - Must be encrypted with KEK before storage
 * - Decrypted version only exists in memory during session
 * 
 * @returns Uint8Array - Random 256-bit key
 */
export function generateVaultKey(): Uint8Array {
  const key = new Uint8Array(CRYPTO_CONSTANTS.KEY_LENGTH);
  crypto.getRandomValues(key);
  return key;
}

/**
 * Generate a random FileKey for encrypting a file.
 * 
 * SECURITY:
 * - Generated for each file upload
 * - Must be encrypted with VaultKey before storage
 * - Cleared from memory immediately after file operation
 * 
 * @returns Uint8Array - Random 256-bit key
 */
export function generateFileKey(): Uint8Array {
  const key = new Uint8Array(CRYPTO_CONSTANTS.KEY_LENGTH);
  crypto.getRandomValues(key);
  return key;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert Uint8Array to base64 string for JSON serialization.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  // Use btoa for browser compatibility
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert base64 string to Uint8Array.
 */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Best-effort clearing of sensitive data from memory.
 * 
 * SECURITY NOTE:
 * JavaScript's garbage collector means we cannot guarantee memory clearing.
 * This is a best-effort approach to reduce the exposure window.
 * This limitation is documented in the threat model as an accepted risk.
 * 
 * @param data - Uint8Array to clear
 */
export function clearSensitiveData(data: Uint8Array): void {
  data.fill(0);
}
