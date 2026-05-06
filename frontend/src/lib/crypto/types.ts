/**
 * Cryptographic Types for Zero-Knowledge Vault
 * 
 * SECURITY CRITICAL: These types define the cryptographic data structures.
 * All encryption/decryption happens client-side using these structures.
 */

// ============================================================================
// KDF (Key Derivation Function) Types
// ============================================================================

/**
 * Parameters for key derivation function.
 * Stored on backend to enable key re-derivation on login.
 */
export interface KdfParams {
  /** Algorithm identifier for future compatibility */
  algorithm: 'pbkdf2-sha256';
  /** Number of PBKDF2 iterations (minimum 100,000 recommended) */
  iterations: number;
  /** Output key length in bytes */
  keyLength: number;
  /** Version for future algorithm upgrades */
  version: number;
}

/**
 * Default KDF parameters.
 * 
 * SECURITY NOTE:
 * - 100,000 iterations is NIST minimum recommendation
 * - Consider increasing for high-security deployments
 * - version field allows future algorithm upgrades
 */
export const DEFAULT_KDF_PARAMS: KdfParams = {
  algorithm: 'pbkdf2-sha256',
  iterations: 100000,
  keyLength: 32, // 256 bits for XChaCha20-Poly1305
  version: 1,
};

// ============================================================================
// Key Types
// ============================================================================

/**
 * Key Encryption Key (KEK) - derived from password.
 * 
 * SECURITY:
 * - NEVER stored anywhere
 * - Derived on-demand from password + salt
 * - Used only to encrypt/decrypt VaultKey
 * - Cleared from memory immediately after use
 */
export type KEK = Uint8Array;

/**
 * Vault Key - master key for all user data.
 * 
 * SECURITY:
 * - Random 256-bit key generated during registration
 * - Stored ONLY encrypted (wrapped by KEK)
 * - Decrypted VaultKey held in memory only during session
 * - NEVER persisted to localStorage/sessionStorage
 * - Cleared on logout or page refresh
 */
export type VaultKey = Uint8Array;

/**
 * File Key - per-file encryption key.
 * 
 * SECURITY:
 * - Random key generated for each file
 * - Encrypted with VaultKey before storage
 * - Decrypted only during file operations
 * - Cleared from memory immediately after use
 */
export type FileKey = Uint8Array;

// ============================================================================
// Encrypted Data Types
// ============================================================================

/**
 * Encrypted blob format used for all encrypted data.
 * 
 * Format: nonce || ciphertext || auth_tag
 * All stored as base64 for JSON serialization.
 */
export interface EncryptedBlob {
  /** Base64-encoded encrypted data (nonce + ciphertext + tag) */
  ciphertext: string;
  /** Algorithm identifier */
  algorithm: 'xchacha20-poly1305';
  /** Version for format upgrades */
  version: number;
}

// ============================================================================
// Registration Types (Zero-Knowledge)
// ============================================================================

/**
 * Data sent to backend during registration.
 * 
 * SECURITY: Password is NOT included.
 * Backend receives only encrypted data it cannot decrypt.
 */
export interface ZKRegistrationData {
  email: string;
  /** Base64-encoded random salt for KDF */
  salt: string;
  /** KDF parameters for key re-derivation */
  kdfParams: KdfParams;
  /** VaultKey encrypted with KEK (derived from password) */
  encryptedVaultKey: EncryptedBlob;
  /** X25519 public key for envelope encryption (base64) */
  publicKey: string;
  /** X25519 private key encrypted with VaultKey (base64) */
  encryptedPrivateKey: string;
  /** Ed25519 public key for challenge-bound login (base64) */
  authPublicKey: string;
  /** Ed25519 private key encrypted with VaultKey */
  encryptedAuthPrivateKey: EncryptedBlob;
}

/**
 * Data returned from backend during login.
 * Client uses this to attempt decryption as authentication.
 */
export interface ZKLoginChallenge {
  userId: string;
  email: string;
  /** Base64-encoded salt */
  salt: string;
  /** KDF parameters */
  kdfParams: KdfParams;
  /** Encrypted VaultKey to decrypt */
  encryptedVaultKey: EncryptedBlob;
  /** Encrypted Ed25519 auth private key to sign challenge after unlock */
  encryptedAuthPrivateKey: EncryptedBlob | null;
  /** One-time challenge ID */
  authChallengeId: string;
  /** Base64-encoded one-time challenge */
  authChallenge: string;
  /** True when backend will create a pending MFA session after signature verify */
  mfaRequired: boolean;
  /** False only for legacy accounts that need auth-key upgrade */
  authKeyRequired: boolean;
}

/**
 * Sent to backend after successful client-side decryption.
 * This proves the user knows the password without revealing it.
 */
export interface ZKLoginProof {
  email: string;
  /** Proof that decryption succeeded (e.g., hash of decrypted key) */
  proof: string;
}

// ============================================================================
// Crypto Operation Results
// ============================================================================

export interface CryptoResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

export const CRYPTO_CONSTANTS = {
  /** Salt length in bytes (256 bits) */
  SALT_LENGTH: 32,
  /** XChaCha20-Poly1305 nonce length */
  NONCE_LENGTH: 24,
  /** XChaCha20-Poly1305 key length */
  KEY_LENGTH: 32,
  /** Auth tag length for Poly1305 */
  TAG_LENGTH: 16,
} as const;
