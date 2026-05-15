/**
 * Main-thread client for the crypto Web Worker.
 *
 * Spawns a single dedicated worker lazily on first use. Falls back to inline
 * crypto if the runtime doesn't support workers (e.g. SSR, tests).
 */

import type { CryptoResult } from './types';

type WorkerResponse =
  | { id: number; ok: true; data: Uint8Array }
  | { id: number; ok: false; error: string };

type Pending = {
  resolve: (data: Uint8Array) => void;
  reject: (error: string) => void;
};

let workerRef: Worker | null = null;
let nextId = 0;
const pending = new Map<number, Pending>();
let initFailed = false;

function canUseWorker(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof Worker !== 'undefined' &&
    !initFailed
  );
}

function getWorker(): Worker | null {
  if (!canUseWorker()) return null;
  if (workerRef) return workerRef;
  try {
    workerRef = new Worker(new URL('./cryptoWorker.ts', import.meta.url), {
      type: 'module',
      name: 'sv-crypto',
    });
    workerRef.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.data);
      else p.reject(msg.error || 'Worker error');
    });
    workerRef.addEventListener('error', (event) => {
      const errorMsg = event.message || 'Worker crashed';
      pending.forEach((p) => p.reject(errorMsg));
      pending.clear();
      try {
        workerRef?.terminate();
      } catch {
        // ignore
      }
      workerRef = null;
      initFailed = true;
    });
  } catch {
    initFailed = true;
    return null;
  }
  return workerRef;
}

function send(
  payload: Record<string, unknown>,
  transfer: Transferable[],
): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve, reject) => {
    const w = getWorker();
    if (!w) {
      reject('Worker unavailable');
      return;
    }
    const id = nextId++;
    pending.set(id, { resolve, reject });
    try {
      w.postMessage({ id, ...payload }, transfer);
    } catch (err) {
      pending.delete(id);
      reject(err instanceof Error ? err.message : 'postMessage failed');
    }
  });
}

/**
 * Encrypt a chunk in the worker. Returns combined nonce||ciphertext.
 * The caller's `plaintext` and `key` buffers are NOT transferred (the worker
 * receives copies), so callers can reuse the originals.
 */
export async function workerEncryptChunk(
  plaintext: Uint8Array,
  key: Uint8Array,
): Promise<CryptoResult<Uint8Array>> {
  if (!canUseWorker()) return { success: false, error: 'Worker unavailable' };
  try {
    const ptCopy = new Uint8Array(plaintext);
    const keyCopy = new Uint8Array(key);
    const data = await send(
      { op: 'encrypt', plaintext: ptCopy, key: keyCopy },
      [ptCopy.buffer, keyCopy.buffer],
    );
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: typeof error === 'string' ? error : 'Worker encrypt failed',
    };
  }
}

export async function workerDecryptChunk(
  ciphertext: Uint8Array,
  key: Uint8Array,
): Promise<CryptoResult<Uint8Array>> {
  if (!canUseWorker()) return { success: false, error: 'Worker unavailable' };
  try {
    const ctCopy = new Uint8Array(ciphertext);
    const keyCopy = new Uint8Array(key);
    const data = await send(
      { op: 'decrypt', ciphertext: ctCopy, key: keyCopy },
      [ctCopy.buffer, keyCopy.buffer],
    );
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: typeof error === 'string' ? error : 'Worker decrypt failed',
    };
  }
}

export async function workerDecryptManifest(
  ciphertext: Uint8Array,
  key: Uint8Array,
  parts: { encryptedSize: number }[],
): Promise<CryptoResult<Uint8Array>> {
  if (!canUseWorker()) return { success: false, error: 'Worker unavailable' };
  try {
    const ctCopy = new Uint8Array(ciphertext);
    const keyCopy = new Uint8Array(key);
    const data = await send(
      { op: 'decryptManifest', ciphertext: ctCopy, key: keyCopy, parts },
      [ctCopy.buffer, keyCopy.buffer],
    );
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: typeof error === 'string' ? error : 'Worker manifest decrypt failed',
    };
  }
}

/** Threshold above which the worker is preferred (bytes). */
export const WORKER_CRYPTO_THRESHOLD = 256 * 1024;

export function shouldUseWorker(sizeBytes: number): boolean {
  return canUseWorker() && sizeBytes >= WORKER_CRYPTO_THRESHOLD;
}
