/**
 * Visual cipher for the live encryption demo on the landing page.
 *
 * NOTE: This is a deterministic visual stand-in — it produces hex bytes
 * that LOOK like XChaCha20 output. For an authentic demo, swap with a
 * real call to your `lib/crypto/encryption.ts` `encrypt()` function.
 */

export function pseudoCipher(text: string, salt = 0): string {
  if (!text) return '';
  const seed = (salt * 2654435761) >>> 0;
  const chars = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    const x = ((c * 131 + i * 17 + seed) >>> 0) & 0xff;
    out += chars[(x >> 4) & 0xf] + chars[x & 0xf];
  }
  return out;
}
