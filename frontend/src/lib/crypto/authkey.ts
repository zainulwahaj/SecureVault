/**
 * Challenge-signing authentication keys.
 *
 * The auth private key is encrypted with the VaultKey and stored on the backend.
 * Login decrypts it after the password unlocks the VaultKey, then signs the
 * backend's one-time challenge. This replaces reusable login proofs for new users.
 */

import sodium from 'libsodium-wrappers';
import { initCrypto, encrypt, decrypt } from './encryption';
import { bytesToBase64, base64ToBytes, clearSensitiveData } from './kdf';
import type { EncryptedBlob, CryptoResult } from './types';

export interface AuthSigningKeyPair {
  authPublicKey: string;
  encryptedAuthPrivateKey: EncryptedBlob;
}

export async function generateEncryptedAuthSigningKeyPair(
  vaultKey: Uint8Array
): Promise<CryptoResult<AuthSigningKeyPair>> {
  try {
    await initCrypto();
    const keypair = sodium.crypto_sign_keypair();
    const encResult = await encrypt(keypair.privateKey, vaultKey);
    clearSensitiveData(keypair.privateKey);

    if (!encResult.success || !encResult.data) {
      return { success: false, error: encResult.error || 'Failed to encrypt auth key' };
    }

    return {
      success: true,
      data: {
        authPublicKey: bytesToBase64(keypair.publicKey),
        encryptedAuthPrivateKey: encResult.data,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate auth key',
    };
  }
}

export async function signLoginChallenge(
  challengeBase64: string,
  encryptedAuthPrivateKey: EncryptedBlob,
  vaultKey: Uint8Array
): Promise<CryptoResult<string>> {
  let privateKey: Uint8Array | null = null;
  try {
    await initCrypto();
    const keyResult = await decrypt(encryptedAuthPrivateKey, vaultKey);
    if (!keyResult.success || !keyResult.data) {
      return { success: false, error: keyResult.error || 'Failed to decrypt auth key' };
    }

    privateKey = keyResult.data;
    const signature = sodium.crypto_sign_detached(base64ToBytes(challengeBase64), privateKey);
    return { success: true, data: bytesToBase64(signature) };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to sign login challenge',
    };
  } finally {
    if (privateKey) clearSensitiveData(privateKey);
  }
}
