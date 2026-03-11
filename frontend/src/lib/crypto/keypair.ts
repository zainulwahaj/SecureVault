/**
 * X25519 Keypair Generation and Envelope Encryption
 *
 * Uses libsodium's crypto_box_seal for anonymous encryption:
 * - Sender encrypts FileKey with recipient's public key
 * - Only recipient can decrypt with their private key
 * - Sender identity is not revealed to recipient
 *
 * Private key is encrypted with user's VaultKey before storage
 */

import sodium from 'libsodium-wrappers';
import { initCrypto } from './encryption';

export interface KeyPair {
  publicKey: string; // Base64 encoded
  privateKey: Uint8Array; // Raw bytes - will be encrypted before storage
}

export interface EncryptedKeyPair {
  publicKey: string; // Base64 - stored plaintext on server
  encryptedPrivateKey: string; // Base64 - encrypted with VaultKey
}

/**
 * Generate a new X25519 keypair for envelope encryption
 */
export async function generateKeyPair(): Promise<KeyPair> {
  await initCrypto();

  const keypair = sodium.crypto_box_keypair();

  return {
    publicKey: sodium.to_base64(keypair.publicKey),
    privateKey: keypair.privateKey,
  };
}

/**
 * Encrypt the private key with VaultKey for secure storage
 */
export async function encryptPrivateKey(
  privateKey: Uint8Array,
  vaultKey: Uint8Array
): Promise<string> {
  await initCrypto();

  // Generate a random nonce
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);

  // Encrypt private key with VaultKey using XChaCha20-Poly1305
  const encrypted = sodium.crypto_secretbox_easy(privateKey, nonce, vaultKey);

  // Combine nonce + ciphertext
  const combined = new Uint8Array(nonce.length + encrypted.length);
  combined.set(nonce);
  combined.set(encrypted, nonce.length);

  return sodium.to_base64(combined);
}

/**
 * Decrypt the private key using VaultKey
 */
export async function decryptPrivateKey(
  encryptedPrivateKey: string,
  vaultKey: Uint8Array
): Promise<Uint8Array> {
  await initCrypto();

  const combined = sodium.from_base64(encryptedPrivateKey);

  // Extract nonce and ciphertext
  const nonce = combined.slice(0, sodium.crypto_secretbox_NONCEBYTES);
  const ciphertext = combined.slice(sodium.crypto_secretbox_NONCEBYTES);

  // Decrypt
  const privateKey = sodium.crypto_secretbox_open_easy(ciphertext, nonce, vaultKey);

  return privateKey;
}

/**
 * Generate keypair and encrypt private key for storage
 */
export async function generateEncryptedKeyPair(
  vaultKey: Uint8Array
): Promise<EncryptedKeyPair> {
  const keypair = await generateKeyPair();
  const encryptedPrivateKey = await encryptPrivateKey(keypair.privateKey, vaultKey);

  // Zero out the raw private key
  keypair.privateKey.fill(0);

  return {
    publicKey: keypair.publicKey,
    encryptedPrivateKey,
  };
}

/**
 * Encrypt a FileKey for a recipient using their public key
 * Uses crypto_box_seal (anonymous encryption)
 */
export async function encryptFileKeyForRecipient(
  fileKey: Uint8Array,
  recipientPublicKey: string
): Promise<string> {
  await initCrypto();

  const publicKey = sodium.from_base64(recipientPublicKey);

  // crypto_box_seal creates an ephemeral keypair internally
  // Only the recipient can decrypt with their private key
  const sealed = sodium.crypto_box_seal(fileKey, publicKey);

  return sodium.to_base64(sealed);
}

/**
 * Decrypt a FileKey that was encrypted for this user
 * Uses crypto_box_seal_open
 */
export async function decryptFileKeyFromSender(
  encryptedFileKey: string,
  publicKey: string,
  privateKey: Uint8Array
): Promise<Uint8Array> {
  await initCrypto();

  const sealed = sodium.from_base64(encryptedFileKey);
  const pubKey = sodium.from_base64(publicKey);

  // Decrypt using our keypair
  const fileKey = sodium.crypto_box_seal_open(sealed, pubKey, privateKey);

  return fileKey;
}
