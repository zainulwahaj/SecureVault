'use client';

/**
 * Public Link Download Page
 *
 * URL format:  /link#token=<token>&key=<base64url link secret>
 *
 * ZERO-KNOWLEDGE:
 * - The fragment (#) is never sent to the server.
 * - The link key is derived client-side to decrypt the FileKey and filename.
 * - If the link is password-protected, the user must enter the password
 *   (verified by bcrypt on the server) before downloading.
 */

import { useState, useEffect, useCallback } from 'react';
import * as api from '@/lib/api';
import { decrypt } from '@/lib/crypto/encryption';
import { decryptFileKey } from '@/lib/crypto/encryption';
import { initCrypto } from '@/lib/crypto/encryption';
import { base64ToBytes } from '@/lib/crypto/kdf';
import { deriveLinkKey } from '@/lib/crypto/link';
import { decryptFileContentWithManifest } from '@/lib/crypto/file';
import type { EncryptedBlob } from '@/lib/crypto/types';
import type { SharedLinkPublicInfo, EncryptedBlobData } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Link as LinkIcon, Lock, AlertCircle, Download, CheckCircle, FileDown } from 'lucide-react';

function fromBase64Url(s: string): Uint8Array {
  let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return base64ToBytes(b64);
}

type ReadyLinkInfo = SharedLinkPublicInfo & {
  encryptedFilename: EncryptedBlobData;
  encryptedFileKey: EncryptedBlobData;
};

type PageState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'password'; info: SharedLinkPublicInfo; linkSecret: Uint8Array }
  | {
      kind: 'ready';
      filename: string;
      linkKey: Uint8Array;
      linkSecret: Uint8Array;
      token: string;
      info: ReadyLinkInfo;
      downloadTicket?: string | null;
    }
  | { kind: 'downloading' }
  | { kind: 'done'; filename: string };

export default function LinkPage() {
  const [state, setState] = useState<PageState>({ kind: 'loading' });
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [verifying, setVerifying] = useState(false);

  const toBlob = (d: EncryptedBlobData): EncryptedBlob => ({
    ciphertext: d.ciphertext,
    algorithm: d.algorithm as 'xchacha20-poly1305',
    version: d.version,
  });

  const decryptFilename = useCallback(async (encBlob: EncryptedBlobData, linkKey: Uint8Array): Promise<string> => {
    const result = await decrypt(toBlob(encBlob), linkKey);
    if (!result.success || !result.data) throw new Error('Failed to decrypt filename');
    return new TextDecoder().decode(result.data);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await initCrypto();

        const hash = window.location.hash.slice(1);
        const params = new URLSearchParams(hash);
        const token = params.get('token');
        const keyParam = params.get('key');
        if (!token || !keyParam) {
          setState({ kind: 'error', message: 'Invalid link — missing token or key.' });
          return;
        }

        const linkSecret = fromBase64Url(keyParam);

        const res = await api.getLinkInfo(token);
        if (!res.success || !res.data) {
          setState({ kind: 'error', message: res.error || 'Link not found or expired.' });
          return;
        }

        const info = res.data;

        if (info.passwordRequired) {
          setState({ kind: 'password', info, linkSecret });
          return;
        }

        if (!info.encryptedFilename || !info.encryptedFileKey) {
          setState({ kind: 'error', message: 'Link metadata is incomplete.' });
          return;
        }

        const linkKey = await deriveLinkKey(linkSecret);
        const filename = await decryptFilename(info.encryptedFilename, linkKey);
        setState({
          kind: 'ready',
          filename,
          linkKey,
          linkSecret,
          token,
          info: {
            ...info,
            encryptedFilename: info.encryptedFilename,
            encryptedFileKey: info.encryptedFileKey,
          },
        });
      } catch {
        setState({ kind: 'error', message: 'Failed to process link.' });
      }
    })();
  }, [decryptFilename]);

  const handlePasswordSubmit = useCallback(async () => {
    if (state.kind !== 'password') return;
    setPasswordError('');
    setVerifying(true);

    try {
      const res = await api.verifyLinkPassword(state.info.token, password);
      if (!res.success) {
        setPasswordError(res.error || 'Verification failed.');
        setVerifying(false);
        return;
      }
      if (!res.data?.valid) {
        setPasswordError('Incorrect password.');
        setVerifying(false);
        return;
      }
      if (!res.data.encryptedFilename || !res.data.encryptedFileKey) {
        setPasswordError('Link metadata is incomplete.');
        setVerifying(false);
        return;
      }

      let linkKey = await deriveLinkKey(state.linkSecret, password);
      let filename: string;
      try {
        filename = await decryptFilename(res.data.encryptedFilename, linkKey);
      } catch {
        linkKey.fill(0);
        linkKey = state.linkSecret.slice();
        filename = await decryptFilename(res.data.encryptedFilename, linkKey);
      }

      setState({
        kind: 'ready',
        filename,
        linkKey,
        linkSecret: state.linkSecret,
        token: state.info.token,
        info: {
          ...state.info,
          encryptedFilename: res.data.encryptedFilename,
          encryptedFileKey: res.data.encryptedFileKey,
          storageMode: res.data.storageMode,
          chunkManifest: res.data.chunkManifest,
        },
        downloadTicket: res.data.downloadTicket || null,
      });
    } catch {
      setPasswordError('Verification failed.');
    } finally {
      setVerifying(false);
    }
  }, [state, password, decryptFilename]);

  const handleDownload = useCallback(async () => {
    if (state.kind !== 'ready') return;
    setState({ kind: 'downloading' });
    let fileKey: Uint8Array | null = null;

    try {
      const fkResult = await decryptFileKey(toBlob(state.info.encryptedFileKey), state.linkKey);
      if (!fkResult.success || !fkResult.data) throw new Error('Failed to decrypt file key');
      fileKey = fkResult.data;

      const dlRes = await api.downloadViaLink(state.token, state.downloadTicket);
      if (!dlRes.success || !dlRes.data) {
        fileKey.fill(0);
        fileKey = null;
        if (state.info.passwordRequired && /ticket/i.test(dlRes.error || '')) {
          setPassword('');
          setPasswordError('Enter the password again to download.');
          setState({ kind: 'password', info: { ...state.info, encryptedFileKey: null }, linkSecret: state.linkSecret });
          return;
        }
        throw new Error(dlRes.error || 'Download failed');
      }

      const decrypted = await decryptFileContentWithManifest(
        dlRes.data,
        fileKey,
        state.info.storageMode === 'chunked' ? state.info.chunkManifest ?? null : null
      );
      if (!decrypted.success || !decrypted.data) throw new Error(decrypted.error || 'Failed to decrypt file');

      fileKey.fill(0);
      fileKey = null;

      const blob = new Blob([new Uint8Array(decrypted.data)]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = state.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setState({ kind: 'done', filename: state.filename });
    } catch (err) {
      if (fileKey) fileKey.fill(0);
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'Download failed.' });
    }
  }, [state]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        {/* Logo */}
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <div className="size-14 rounded-xl bg-primary/10 flex items-center justify-center">
              <LinkIcon className="size-7 text-primary" />
            </div>
          </div>
          <CardTitle>SecureVault</CardTitle>
          <CardDescription>Shared file download</CardDescription>
        </CardHeader>

        <CardContent>
          {/* Loading */}
          {state.kind === 'loading' && (
            <div className="text-center py-8 space-y-3">
              <Spinner className="size-8 mx-auto" />
              <p className="text-sm text-muted-foreground">Loading link…</p>
            </div>
          )}

          {/* Error */}
          {state.kind === 'error' && (
            <div className="text-center py-6 space-y-3">
              <div className="size-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
                <AlertCircle className="size-6 text-destructive" />
              </div>
              <p className="text-sm text-destructive">{state.message}</p>
            </div>
          )}

          {/* Password form */}
          {state.kind === 'password' && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="size-12 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-3">
                  <Lock className="size-6 text-amber-600 dark:text-amber-400" />
                </div>
                <p className="text-sm text-muted-foreground">
                  This file is password protected.
                </p>
              </div>
              <Input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handlePasswordSubmit()}
                placeholder="Enter password"
                autoFocus
              />
              {passwordError && (
                <Alert variant="destructive">
                  <AlertCircle className="size-4" />
                  <AlertDescription>{passwordError}</AlertDescription>
                </Alert>
              )}
              <Button
                onClick={handlePasswordSubmit}
                disabled={verifying || !password}
                className="w-full"
              >
                {verifying ? <><Spinner className="size-4 mr-2" /> Verifying…</> : 'Unlock'}
              </Button>
            </div>
          )}

          {/* Ready to download */}
          {state.kind === 'ready' && (
            <div className="text-center space-y-4">
              <div className="size-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                <FileDown className="size-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="font-medium text-foreground truncate">{state.filename}</p>
                {state.info.maxDownloads && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {state.info.downloadCount} / {state.info.maxDownloads} downloads used
                  </p>
                )}
                {state.info.expiresAt && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Expires {new Date(state.info.expiresAt).toLocaleString()}
                  </p>
                )}
              </div>
              <Button onClick={handleDownload} className="w-full">
                <Download className="size-4 mr-2" />
                Download &amp; Decrypt
              </Button>
              <p className="text-xs text-muted-foreground">
                End-to-end encrypted — decrypted in your browser.
              </p>
            </div>
          )}

          {/* Downloading */}
          {state.kind === 'downloading' && (
            <div className="text-center py-8 space-y-3">
              <Spinner className="size-8 mx-auto" />
              <p className="text-sm text-muted-foreground">Downloading &amp; decrypting…</p>
            </div>
          )}

          {/* Done */}
          {state.kind === 'done' && (
            <div className="text-center space-y-3">
              <div className="size-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                <CheckCircle className="size-6 text-green-600" />
              </div>
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{state.filename}</span> downloaded successfully.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
