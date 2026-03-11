'use client';

/**
 * LinkShareDialog — Create a shareable link for a file.
 *
 * ZERO-KNOWLEDGE LINK SHARING:
 * 1. Generate a random 32-byte "link key" client-side.
 * 2. Decrypt the FileKey using VaultKey.
 * 3. Re-encrypt the FileKey AND the filename with the link key.
 * 4. Send encrypted blobs + optional password/expiry/limit to backend.
 * 5. Backend returns a token.  We build the URL:
 *      /link#token=<token>&key=<base64url-encoded link key>
 *    The fragment (#) is NEVER sent to the server.
 * 6. Recipient opens the URL → /link page reads fragment, fetches
 *    encrypted data via public API, decrypts with the link key.
 */

import { useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import type { DecryptedFile, EncryptedBlobData, SharedLinkResponse } from '@/types';
import type { EncryptedBlob } from '@/lib/crypto/types';
import * as api from '@/lib/api';
import { decryptFileKey, encryptFileKey } from '@/lib/crypto/encryption';
import { encrypt } from '@/lib/crypto/encryption';
import { initCrypto } from '@/lib/crypto/encryption';
import { bytesToBase64, base64ToBytes } from '@/lib/crypto/kdf';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { Copy, Check, Link as LinkIcon, Lock, XCircle } from 'lucide-react';

interface LinkShareDialogProps {
  file: DecryptedFile;
  isOpen: boolean;
  onClose: () => void;
}

/** Base64url encode (URL-safe, no padding) */
function toBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return base64ToBytes(b64);
}

export { fromBase64Url };

export default function LinkShareDialog({ file, isOpen, onClose }: LinkShareDialogProps) {
  const { getVaultKey } = useAuth();

  // Form state
  const [password, setPassword] = useState('');
  const [expiresIn, setExpiresIn] = useState<string>('never');
  const [maxDownloads, setMaxDownloads] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);

  // Result state
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [linkInfo, setLinkInfo] = useState<SharedLinkResponse | null>(null);
  const [copied, setCopied] = useState(false);

  // Existing links for this file
  const [existingLinks, setExistingLinks] = useState<SharedLinkResponse[]>([]);
  const [loadedLinks, setLoadedLinks] = useState(false);

  const loadExistingLinks = useCallback(async () => {
    if (loadedLinks) return;
    const res = await api.listLinksForFile(file.id);
    if (res.success && res.data) {
      setExistingLinks(res.data.links);
    }
    setLoadedLinks(true);
  }, [file.id, loadedLinks]);

  if (isOpen && !loadedLinks) {
    loadExistingLinks();
  }

  const toEncryptedBlob = (data: EncryptedBlobData): EncryptedBlob => ({
    ciphertext: data.ciphertext,
    algorithm: data.algorithm as 'xchacha20-poly1305',
    version: data.version,
  });

  const handleCreate = useCallback(async () => {
    const vaultKey = getVaultKey();
    if (!vaultKey) {
      toast.error('Vault is locked');
      return;
    }

    setIsCreating(true);
    try {
      await initCrypto();

      const linkKey = new Uint8Array(32);
      crypto.getRandomValues(linkKey);

      const fkResult = await decryptFileKey(toEncryptedBlob(file.encryptedFileKey), vaultKey);
      if (!fkResult.success || !fkResult.data) {
        toast.error('Failed to decrypt file key');
        return;
      }

      const encFkResult = await encryptFileKey(fkResult.data, linkKey);
      fkResult.data.fill(0);
      if (!encFkResult.success || !encFkResult.data) {
        toast.error('Failed to encrypt for link');
        return;
      }

      const filenameBytes = new TextEncoder().encode(file.filename);
      const encFnResult = await encrypt(filenameBytes, linkKey);
      if (!encFnResult.success || !encFnResult.data) {
        toast.error('Failed to encrypt filename');
        return;
      }

      let expiresAt: string | undefined;
      if (expiresIn !== 'never') {
        const ms: Record<string, number> = {
          '1h': 3600_000,
          '24h': 86400_000,
          '7d': 604800_000,
          '30d': 2592000_000,
        };
        expiresAt = new Date(Date.now() + ms[expiresIn]).toISOString();
      }

      const res = await api.createLink(
        file.id,
        encFkResult.data,
        encFnResult.data,
        {
          password: password || undefined,
          expiresAt,
          maxDownloads: maxDownloads ? parseInt(maxDownloads, 10) : undefined,
        },
      );

      if (!res.success || !res.data) {
        toast.error('Failed to create link', { description: res.error });
        return;
      }

      const base = window.location.origin;
      const url = `${base}/link#token=${res.data.token}&key=${toBase64Url(linkKey)}`;
      linkKey.fill(0);

      setGeneratedUrl(url);
      setLinkInfo(res.data);
      setExistingLinks(prev => [res.data!, ...prev]);
      toast.success('Link created');
    } catch {
      toast.error('Failed to create link');
    } finally {
      setIsCreating(false);
    }
  }, [file, getVaultKey, password, expiresIn, maxDownloads]);

  const handleCopy = useCallback(async () => {
    if (!generatedUrl) return;
    await navigator.clipboard.writeText(generatedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [generatedUrl]);

  const handleRevoke = useCallback(async (token: string) => {
    const res = await api.revokeLink(token);
    if (res.success) {
      setExistingLinks(prev => prev.map(l => l.token === token ? { ...l, isActive: false } : l));
      toast.success('Link revoked');
    } else {
      toast.error('Failed to revoke', { description: res.error });
    }
  }, []);

  const handleClose = () => {
    setGeneratedUrl(null);
    setLinkInfo(null);
    setPassword('');
    setExpiresIn('never');
    setMaxDownloads('');
    setCopied(false);
    setLoadedLinks(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LinkIcon className="size-5" />
            Share via Link
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {generatedUrl ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Link created for <span className="font-medium text-foreground">{file.filename}</span>
              </p>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={generatedUrl}
                  className="font-mono text-xs"
                />
                <Button onClick={handleCopy} variant={copied ? 'secondary' : 'default'} className="shrink-0">
                  {copied ? <><Check className="size-4 mr-1" /> Copied</> : <><Copy className="size-4 mr-1" /> Copy</>}
                </Button>
              </div>
              {linkInfo?.passwordProtected && (
                <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <Lock className="size-3" /> Password protected — share the password separately.
                </p>
              )}
              {linkInfo?.expiresAt && (
                <p className="text-xs text-muted-foreground">
                  Expires: {new Date(linkInfo.expiresAt).toLocaleString()}
                </p>
              )}
              {linkInfo?.maxDownloads && (
                <p className="text-xs text-muted-foreground">
                  Max downloads: {linkInfo.maxDownloads}
                </p>
              )}
              <Button
                variant="link"
                className="px-0"
                onClick={() => { setGeneratedUrl(null); setLinkInfo(null); }}
              >
                Create another link
              </Button>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Create a shareable link for <span className="font-medium text-foreground">{file.filename}</span>.
                Anyone with the link can download — no account required.
              </p>

              <div className="space-y-1.5">
                <Label>Password (optional)</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Leave empty for no password"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Expires</Label>
                <select
                  value={expiresIn}
                  onChange={e => setExpiresIn(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring"
                >
                  <option value="never">Never</option>
                  <option value="1h">1 hour</option>
                  <option value="24h">24 hours</option>
                  <option value="7d">7 days</option>
                  <option value="30d">30 days</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label>Max downloads (optional)</Label>
                <Input
                  type="number"
                  min="1"
                  value={maxDownloads}
                  onChange={e => setMaxDownloads(e.target.value)}
                  placeholder="Unlimited"
                />
              </div>

              <Button onClick={handleCreate} disabled={isCreating} className="w-full">
                {isCreating ? <><Spinner className="size-4 mr-2" /> Creating…</> : 'Create Link'}
              </Button>
            </>
          )}

          {existingLinks.length > 0 && (
            <div className="border-t pt-4 space-y-2">
              <h3 className="text-sm font-medium text-foreground">
                Existing links ({existingLinks.length})
              </h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {existingLinks.map(link => (
                  <div
                    key={link.id}
                    className="flex items-center justify-between p-2.5 bg-muted rounded-lg text-xs"
                  >
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <span className={`font-mono truncate block ${!link.isActive ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                        …{link.token.slice(-12)}
                      </span>
                      <span className="text-muted-foreground">
                        {link.downloadCount} downloads
                        {link.passwordProtected && ' · 🔒'}
                        {link.expiresAt && ` · expires ${new Date(link.expiresAt).toLocaleDateString()}`}
                        {!link.isActive && ' · revoked'}
                      </span>
                    </div>
                    {link.isActive && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevoke(link.token)}
                        className="text-destructive hover:bg-destructive/10 ml-2"
                      >
                        <XCircle className="size-3.5 mr-1" />
                        Revoke
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
