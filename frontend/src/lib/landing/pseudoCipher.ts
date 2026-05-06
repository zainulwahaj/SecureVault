/**
 * Visual cipher for the live encryption demo on the landing page.
 *
 * This is a deterministic visual stand-in. It produces hex bytes that look
 * like encrypted output, but it is intentionally not used for real file data.
 */
export function pseudoCipher(text: string, salt = 0): string {
  if (!text) return '';

  const seed = (salt * 2654435761) >>> 0;
  const chars = '0123456789abcdef';
  let out = '';

  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    const x = ((c * 131 + i * 17 + seed) >>> 0) & 0xff;
    out += chars[(x >> 4) & 0xf] + chars[x & 0xf];
  }

  return out;
}
