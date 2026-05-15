/**
 * Recovery-key crypto helpers.
 *
 * A recovery key is a long random secret presented to the user once. The
 * client derives a recovery KEK from (recovery_key, salt) and wraps the
 * VaultKey under it — the backend stores only the wrapped blob.
 */

import sodium from 'libsodium-wrappers';
import type { CryptoResult, EncryptedBlob, KdfParams } from './types';
import { CRYPTO_CONSTANTS, DEFAULT_KDF_PARAMS } from './types';
import { deriveKEK, generateSalt, bytesToBase64 } from './kdf';
import { initCrypto, encryptVaultKey, decryptVaultKey } from './encryption';

const RECOVERY_KEY_BYTES = 24;
const RECOVERY_KDF_PARAMS: KdfParams = {
  ...DEFAULT_KDF_PARAMS,
  iterations: Math.max(DEFAULT_KDF_PARAMS.iterations, 250_000),
};

/** Format raw bytes as XXXX-XXXX-... groups for the on-screen recovery code. */
function formatRecoveryDisplay(raw: Uint8Array): string {
  const hex = Array.from(raw)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return hex.match(/.{1,4}/g)?.join('-') ?? hex;
}

/** Strip group separators / whitespace, return the canonical hex string. */
function canonicalizeRecoveryInput(input: string): string {
  return input.replace(/[\s-]+/g, '').toUpperCase();
}

export type GeneratedRecoveryKey = {
  /** Raw 24-byte secret (will be wiped after use). */
  raw: Uint8Array;
  /** XXXX-XXXX-... presentation string shown to the user once. */
  display: string;
  /** Canonical hex without separators — what we hash through PBKDF2. */
  canonical: string;
};

export function generateRecoveryKey(): GeneratedRecoveryKey {
  const raw = new Uint8Array(RECOVERY_KEY_BYTES);
  crypto.getRandomValues(raw);
  const display = formatRecoveryDisplay(raw);
  return { raw, display, canonical: display.replace(/-/g, '') };
}

/**
 * Build the wrapped-VaultKey blob to upload during recovery setup.
 * Returns the blob plus the salt + KDF params chosen for it.
 */
export async function buildRecoveryEnrollment(
  recoveryCanonicalHex: string,
  vaultKey: Uint8Array,
): Promise<CryptoResult<{
  recoverySalt: string;
  recoveryKdfParams: KdfParams;
  encryptedVaultKeyRecovery: EncryptedBlob;
}>> {
  await initCrypto();
  const salt = generateSalt();
  const kekResult = await deriveKEK(recoveryCanonicalHex, salt, RECOVERY_KDF_PARAMS);
  if (!kekResult.success || !kekResult.data) {
    return { success: false, error: kekResult.error };
  }
  const wrapResult = await encryptVaultKey(vaultKey, kekResult.data);
  if (!wrapResult.success || !wrapResult.data) {
    return { success: false, error: wrapResult.error };
  }
  return {
    success: true,
    data: {
      recoverySalt: bytesToBase64(salt),
      recoveryKdfParams: RECOVERY_KDF_PARAMS,
      encryptedVaultKeyRecovery: wrapResult.data,
    },
  };
}

/**
 * Unwrap a VaultKey using a presented recovery key + the server-stored salt/params/blob.
 */
export async function unwrapVaultKeyWithRecovery(
  recoveryInput: string,
  recoverySalt: Uint8Array,
  recoveryKdfParams: KdfParams,
  encryptedVaultKeyRecovery: EncryptedBlob,
): Promise<CryptoResult<Uint8Array>> {
  await initCrypto();
  const canonical = canonicalizeRecoveryInput(recoveryInput);
  if (canonical.length === 0) {
    return { success: false, error: 'Recovery key is required' };
  }
  const kekResult = await deriveKEK(canonical, recoverySalt, recoveryKdfParams);
  if (!kekResult.success || !kekResult.data) {
    return { success: false, error: kekResult.error };
  }
  return decryptVaultKey(encryptedVaultKeyRecovery, kekResult.data);
}

export const RecoveryConstants = {
  RECOVERY_KEY_BYTES,
  RECOVERY_KDF_PARAMS,
  SALT_LENGTH: CRYPTO_CONSTANTS.SALT_LENGTH,
} as const;
