/**
 * Main Crypto Module - Zero-Knowledge Authentication
 * 
 * This module provides the high-level cryptographic operations
 * for the zero-knowledge authentication system.
 * 
 * SECURITY ARCHITECTURE:
 * 1. Registration: Generate salt + VaultKey, encrypt VaultKey with KEK (from password)
 * 2. Login: Fetch encrypted data, derive KEK, attempt decryption
 * 3. Success = password correct, Failure = wrong password
 * 4. Backend NEVER sees password or decryption keys
 */

import type { 
  KdfParams, 
  EncryptedBlob, 
  ZKRegistrationData,
  CryptoResult 
} from './types';
import { DEFAULT_KDF_PARAMS } from './types';
import { 
  deriveKEK, 
  generateSalt, 
  generateVaultKey,
  bytesToBase64,
  base64ToBytes,
  clearSensitiveData 
} from './kdf';
import { 
  initCrypto,
  encryptVaultKey, 
  decryptVaultKey 
} from './encryption';
import { generateEncryptedKeyPair } from './keypair';

// Re-export types and utilities
export * from './types';
export { bytesToBase64, base64ToBytes, clearSensitiveData } from './kdf';
export { initCrypto } from './encryption';

// Re-export file encryption module
export * from './file';

// Re-export keypair module
export * from './keypair';

// Re-export TOTP module
export * from './totp';

/**
 * Prepare registration data for zero-knowledge signup.
 * 
 * This function:
 * 1. Generates random salt
 * 2. Derives KEK from password
 * 3. Generates random VaultKey
 * 4. Encrypts VaultKey with KEK
 * 5. Generates X25519 keypair for envelope encryption
 * 6. Encrypts private key with VaultKey
 * 7. Returns data safe to send to backend
 * 
 * SECURITY: Password is processed locally and NEVER included in output.
 * 
 * @param email - User's email address
 * @param password - User's password (processed locally only)
 * @returns ZKRegistrationData to send to backend
 */
export async function prepareRegistration(
  email: string,
  password: string
): Promise<CryptoResult<{ registrationData: ZKRegistrationData; vaultKey: Uint8Array }>> {
  try {
    // Initialize crypto library
    await initCrypto();
    
    // Step 1: Generate random salt
    const salt = generateSalt();
    
    // Step 2: Derive KEK from password + salt
    const kekResult = await deriveKEK(password, salt, DEFAULT_KDF_PARAMS);
    if (!kekResult.success || !kekResult.data) {
      return { success: false, error: kekResult.error || 'Key derivation failed' };
    }
    const kek = kekResult.data;
    
    // Step 3: Generate random VaultKey
    const vaultKey = generateVaultKey();
    
    // Step 4: Encrypt VaultKey with KEK
    const encryptResult = await encryptVaultKey(vaultKey, kek);
    if (!encryptResult.success || !encryptResult.data) {
      // Clean up sensitive data
      clearSensitiveData(kek);
      clearSensitiveData(vaultKey);
      return { success: false, error: encryptResult.error || 'Encryption failed' };
    }
    
    // Step 5: Clear KEK from memory (no longer needed)
    clearSensitiveData(kek);
    
    // Step 6: Generate X25519 keypair for envelope encryption (file sharing)
    const keypair = await generateEncryptedKeyPair(vaultKey);
    
    // Prepare data for backend (password NOT included)
    const registrationData: ZKRegistrationData = {
      email: email.toLowerCase().trim(),
      salt: bytesToBase64(salt),
      kdfParams: DEFAULT_KDF_PARAMS,
      encryptedVaultKey: encryptResult.data,
      publicKey: keypair.publicKey,
      encryptedPrivateKey: keypair.encryptedPrivateKey,
    };
    
    return {
      success: true,
      data: {
        registrationData,
        vaultKey, // Return to caller for session storage in memory
      },
    };
    
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Registration preparation failed',
    };
  }
}

/**
 * Attempt zero-knowledge login by decrypting the VaultKey.
 * 
 * This function:
 * 1. Derives KEK from password + salt (from backend)
 * 2. Attempts to decrypt VaultKey
 * 3. If successful → password was correct
 * 4. If failed → password was wrong
 * 
 * SECURITY: Password verification happens via cryptographic proof.
 * Backend cannot verify password - only client can.
 * 
 * @param password - User's password attempt
 * @param salt - Salt from backend (base64)
 * @param kdfParams - KDF parameters from backend
 * @param encryptedVaultKey - Encrypted VaultKey from backend
 * @returns Decrypted VaultKey if password correct, error if wrong
 */
export async function attemptLogin(
  password: string,
  salt: string,
  kdfParams: KdfParams,
  encryptedVaultKey: EncryptedBlob
): Promise<CryptoResult<Uint8Array>> {
  try {
    // Initialize crypto library
    await initCrypto();
    
    // Step 1: Derive KEK from password + salt
    const kekResult = await deriveKEK(password, salt, kdfParams);
    if (!kekResult.success || !kekResult.data) {
      return { success: false, error: kekResult.error || 'Key derivation failed' };
    }
    const kek = kekResult.data;
    
    // Step 2: Attempt to decrypt VaultKey
    const decryptResult = await decryptVaultKey(encryptedVaultKey, kek);
    
    // Step 3: Clear KEK from memory immediately
    clearSensitiveData(kek);
    
    // Step 4: Return result
    if (!decryptResult.success || !decryptResult.data) {
      // Decryption failed = wrong password
      // SECURITY: Generic error prevents password enumeration
      return { 
        success: false, 
        error: 'Invalid password' 
      };
    }
    
    return {
      success: true,
      data: decryptResult.data, // VaultKey for session
    };
    
  } catch (error) {
    return {
      success: false,
      error: 'Login failed',
    };
  }
}

/**
 * Generate a proof that login succeeded (for backend session creation).
 * 
 * This is a hash of the VaultKey that proves decryption succeeded
 * without revealing the actual VaultKey to the backend.
 * 
 * @param vaultKey - Successfully decrypted VaultKey
 * @returns Base64-encoded proof string
 */
export async function generateLoginProof(vaultKey: Uint8Array): Promise<string> {
  // Use SHA-256 to create a proof without revealing the key
  const hashBuffer = await crypto.subtle.digest('SHA-256', vaultKey as BufferSource);
  return bytesToBase64(new Uint8Array(hashBuffer));
}

/**
 * Verify that a VaultKey produces a specific proof.
 * Used during registration to store the proof for later login verification.
 * 
 * @param vaultKey - VaultKey to verify
 * @param proof - Expected proof string
 * @returns true if VaultKey produces the proof
 */
export async function verifyLoginProof(
  vaultKey: Uint8Array, 
  proof: string
): Promise<boolean> {
  const computedProof = await generateLoginProof(vaultKey);
  return computedProof === proof;
}
