/// <reference lib="webworker" />
/**
 * Dedicated Web Worker for symmetric file crypto.
 *
 * Runs XChaCha20-Poly1305 encrypt/decrypt off the main thread so large
 * files don't freeze the UI during upload/download.
 *
 * Protocol (request → response):
 *   { id, op: 'encrypt', plaintext: Uint8Array, key: Uint8Array }
 *     → { id, ok: true,  data: Uint8Array }   // nonce || ciphertext
 *   { id, op: 'decrypt', ciphertext: Uint8Array, key: Uint8Array }
 *     → { id, ok: true,  data: Uint8Array }   // plaintext
 *   { id, op: 'decryptManifest', ciphertext: Uint8Array, key: Uint8Array,
 *     parts: { encryptedSize: number }[] }
 *     → { id, ok: true,  data: Uint8Array }
 *   any failure → { id, ok: false, error: string }
 *
 * All Uint8Array values cross the message boundary as transferables.
 */

import sodium from 'libsodium-wrappers';

type EncryptRequest = {
  id: number;
  op: 'encrypt';
  plaintext: Uint8Array;
  key: Uint8Array;
};

type DecryptRequest = {
  id: number;
  op: 'decrypt';
  ciphertext: Uint8Array;
  key: Uint8Array;
};

type DecryptManifestRequest = {
  id: number;
  op: 'decryptManifest';
  ciphertext: Uint8Array;
  key: Uint8Array;
  parts: { encryptedSize: number }[];
};

type WorkerRequest = EncryptRequest | DecryptRequest | DecryptManifestRequest;

let ready: Promise<void> | null = null;

function ensureReady(): Promise<void> {
  if (!ready) {
    ready = sodium.ready;
  }
  return ready;
}

function fail(id: number, error: string) {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage({ id, ok: false, error });
}

function ok(id: number, data: Uint8Array) {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(
    { id, ok: true, data },
    { transfer: [data.buffer] },
  );
}

function encryptOp(req: EncryptRequest) {
  if (req.key.length !== 32) {
    fail(req.id, 'Key must be 32 bytes');
    return;
  }
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const ciphertext = sodium.crypto_secretbox_easy(req.plaintext, nonce, req.key);
  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce);
  combined.set(ciphertext, nonce.length);
  ok(req.id, combined);
}

function decryptOnce(ciphertext: Uint8Array, key: Uint8Array): Uint8Array {
  const nonceLength = sodium.crypto_secretbox_NONCEBYTES;
  if (ciphertext.length < nonceLength + sodium.crypto_secretbox_MACBYTES) {
    throw new Error('Invalid ciphertext: too short');
  }
  const nonce = ciphertext.slice(0, nonceLength);
  const body = ciphertext.slice(nonceLength);
  return sodium.crypto_secretbox_open_easy(body, nonce, key);
}

function decryptOp(req: DecryptRequest) {
  if (req.key.length !== 32) {
    fail(req.id, 'Key must be 32 bytes');
    return;
  }
  ok(req.id, decryptOnce(req.ciphertext, req.key));
}

function decryptManifestOp(req: DecryptManifestRequest) {
  if (req.key.length !== 32) {
    fail(req.id, 'Key must be 32 bytes');
    return;
  }
  const parts: Uint8Array[] = [];
  let offset = 0;
  for (const part of req.parts) {
    const size = part.encryptedSize;
    if (!Number.isFinite(size) || size <= 0) {
      fail(req.id, 'Invalid chunk manifest entry');
      return;
    }
    const end = offset + size;
    if (end > req.ciphertext.length) {
      fail(req.id, 'Chunk manifest exceeds encrypted content length');
      return;
    }
    parts.push(decryptOnce(req.ciphertext.slice(offset, end), req.key));
    offset = end;
  }
  if (offset !== req.ciphertext.length) {
    fail(req.id, 'Encrypted content has bytes outside the chunk manifest');
    return;
  }
  const total = parts.reduce((s, p) => s + p.length, 0);
  const merged = new Uint8Array(total);
  let writeOffset = 0;
  for (const p of parts) {
    merged.set(p, writeOffset);
    writeOffset += p.length;
  }
  ok(req.id, merged);
}

(self as unknown as DedicatedWorkerGlobalScope).addEventListener(
  'message',
  async (event: MessageEvent<WorkerRequest>) => {
    const req = event.data;
    try {
      await ensureReady();
      switch (req.op) {
        case 'encrypt':
          encryptOp(req);
          break;
        case 'decrypt':
          decryptOp(req);
          break;
        case 'decryptManifest':
          decryptManifestOp(req);
          break;
        default:
          fail((req as { id: number }).id, 'Unknown worker op');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Worker crypto failed';
      fail(req.id, message);
    }
  },
);

export {};
