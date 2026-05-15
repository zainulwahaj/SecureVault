/**
 * Public-link key derivation.
 *
 * The URL fragment carries a high-entropy link secret. For password-protected
 * links, the actual encryption key is derived from link secret + password, so
 * the password is required both for server download authorization and local
 * decryption of the FileKey/filename.
 */

import { clearSensitiveData } from './kdf';

const LINK_KEY_CONTEXT = 'SecureVault link key v1';

export async function deriveLinkKey(
  linkSecret: Uint8Array,
  password?: string
): Promise<Uint8Array> {
  if (!password) {
    return new Uint8Array(linkSecret);
  }

  const context = new TextEncoder().encode(LINK_KEY_CONTEXT);
  const passwordBytes = new TextEncoder().encode(password);
  const material = new Uint8Array(context.length + linkSecret.length + passwordBytes.length);
  material.set(context);
  material.set(linkSecret, context.length);
  material.set(passwordBytes, context.length + linkSecret.length);

  const digest = await crypto.subtle.digest('SHA-256', material as BufferSource);
  clearSensitiveData(material);
  return new Uint8Array(digest);
}
