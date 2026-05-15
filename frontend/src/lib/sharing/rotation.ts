/**
 * Strong-revocation rewrap orchestrator.
 *
 * After a recipient is server-side revoked, the cryptographic completion is
 * to download the file, decrypt it under the old FileKey, generate a fresh
 * FileKey, re-encrypt the content, and produce new envelopes for every
 * recipient who should keep access.
 *
 * The backend `POST /sharing/files/{file_id}/rotate-content` endpoint applies
 * the swap atomically. Public links on the file are deactivated server-side
 * because their wrap is bound to the old key.
 */

import * as api from '@/lib/api';
import type {
  EncryptedBlobPayload,
  RotateRecipientEnvelopePayload,
  RotateFileContentResponse,
} from '@/lib/api';
import {
  decryptFileKey,
  decryptFileContentWithManifest,
  encryptFileContent,
  encryptFileKey,
  encryptMetadata,
  generateFileKey,
} from '@/lib/crypto/file';
import type { EncryptedBlob, VaultKey } from '@/lib/crypto/types';
import { encryptFileKeyForRecipient } from '@/lib/crypto/keypair';
import { base64ToBytes, clearSensitiveData } from '@/lib/crypto/kdf';

export type RotationFile = {
  id: string;
  /** Current FileKey wrapped with the owner's VaultKey. */
  encryptedFileKey: EncryptedBlob;
  /** Plaintext filename — will be re-encrypted under the new FileKey. */
  filename: string;
  /** Plaintext MIME type — will be re-encrypted under the new FileKey. */
  mimeType?: string;
  chunkManifest?: unknown;
};

export type RotationRecipient = {
  recipientId: string;
  publicKey: string;
  publicKeyFingerprint: string;
  deviceKeys?: Array<{
    id: string;
    fingerprint: string;
    encryptionPublicKey: string;
  }>;
};

export type RotationResult = {
  success: boolean;
  error?: string;
  response?: RotateFileContentResponse;
};

function toBlobPayload(blob: EncryptedBlob): EncryptedBlobPayload {
  return {
    ciphertext: blob.ciphertext,
    algorithm: blob.algorithm,
    version: blob.version,
  };
}

async function sealFileKey(fileKey: Uint8Array, publicKey: string): Promise<EncryptedBlobPayload> {
  const sealed = await encryptFileKeyForRecipient(fileKey, publicKey);
  return {
    ciphertext: sealed,
    algorithm: 'x25519-sealed-box',
    version: 1,
  };
}

/**
 * Run the full rotation flow client-side and submit it to the backend.
 *
 * `remainingRecipients` are the recipients whose access should *survive* the
 * rotation (i.e. everyone except the strong-revoked user). The backend will
 * revoke any active share on the file that isn't represented here.
 */
export async function rotateFileContent(
  file: RotationFile,
  vaultKey: VaultKey,
  remainingRecipients: RotationRecipient[],
): Promise<RotationResult> {
  let oldFileKey: Uint8Array | null = null;
  let newFileKey: Uint8Array | null = null;
  try {
    // 1. Recover the existing FileKey using the owner's VaultKey.
    const oldKeyResult = await decryptFileKey(file.encryptedFileKey, vaultKey);
    if (!oldKeyResult.success || !oldKeyResult.data) {
      return { success: false, error: oldKeyResult.error || 'Could not unwrap current FileKey' };
    }
    oldFileKey = oldKeyResult.data;

    // 2. Pull the existing ciphertext and decrypt it.
    const download = await api.downloadFile(file.id);
    if (!download.success || !download.data) {
      return { success: false, error: download.error || 'Download failed' };
    }
    const manifest =
      typeof file.chunkManifest === 'object' && file.chunkManifest !== null
        ? (file.chunkManifest as Parameters<typeof decryptFileContentWithManifest>[2])
        : null;
    const plaintextResult = await decryptFileContentWithManifest(download.data, oldFileKey, manifest);
    if (!plaintextResult.success || !plaintextResult.data) {
      return { success: false, error: plaintextResult.error || 'Decryption failed' };
    }

    // 3. Generate a new FileKey and re-encrypt content + metadata under it.
    newFileKey = generateFileKey();
    const reEncrypted = await encryptFileContent(plaintextResult.data, newFileKey);
    if (!reEncrypted.success || !reEncrypted.data) {
      return { success: false, error: reEncrypted.error || 'Re-encryption failed' };
    }
    const newEncryptedFileKey = await encryptFileKey(newFileKey, vaultKey);
    if (!newEncryptedFileKey.success || !newEncryptedFileKey.data) {
      return {
        success: false,
        error: newEncryptedFileKey.error || 'FileKey wrap failed',
      };
    }

    // Filename + MIME were encrypted with the old FileKey — rewrap them too.
    const newEncryptedFilename = await encryptMetadata(file.filename, newFileKey);
    if (!newEncryptedFilename.success || !newEncryptedFilename.data) {
      return { success: false, error: newEncryptedFilename.error || 'Filename wrap failed' };
    }
    const mimeToEncrypt = file.mimeType || 'application/octet-stream';
    const newEncryptedMime = await encryptMetadata(mimeToEncrypt, newFileKey);
    if (!newEncryptedMime.success || !newEncryptedMime.data) {
      return { success: false, error: newEncryptedMime.error || 'MIME wrap failed' };
    }

    // 4. Build a fresh envelope for every surviving recipient.
    const recipientEnvelopes: RotateRecipientEnvelopePayload[] = [];
    for (const recipient of remainingRecipients) {
      const publicKeyBytes = base64ToBytes(recipient.publicKey);
      if (publicKeyBytes.length !== 32) {
        return { success: false, error: `Invalid public key for ${recipient.recipientId}` };
      }
      const userEnvelope = await sealFileKey(newFileKey, recipient.publicKey);
      const deviceEnvelopes: RotateRecipientEnvelopePayload['deviceEnvelopes'] = [];
      for (const device of recipient.deviceKeys ?? []) {
        const sealed = await sealFileKey(newFileKey, device.encryptionPublicKey);
        deviceEnvelopes.push({
          recipientDeviceKeyId: device.id,
          recipientDeviceKeyFingerprint: device.fingerprint,
          encryptedFileKey: sealed,
        });
      }
      recipientEnvelopes.push({
        recipientId: recipient.recipientId,
        recipientPublicKeyFingerprint: recipient.publicKeyFingerprint,
        encryptedFileKeyForRecipient: userEnvelope,
        deviceEnvelopes: deviceEnvelopes.length ? deviceEnvelopes : undefined,
      });
    }

    // 5. Submit the rotation atomically.
    const submission = await api.rotateFileContent(file.id, reEncrypted.data, {
      encryptedFileKey: toBlobPayload(newEncryptedFileKey.data),
      encryptedFilename: toBlobPayload(newEncryptedFilename.data),
      encryptedMimeType: toBlobPayload(newEncryptedMime.data),
      recipientEnvelopes,
    });
    if (!submission.success || !submission.data) {
      return { success: false, error: submission.error || 'Rotation rejected' };
    }
    return { success: true, response: submission.data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Rotation failed',
    };
  } finally {
    if (oldFileKey) clearSensitiveData(oldFileKey);
    if (newFileKey) clearSensitiveData(newFileKey);
  }
}
