'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import type {
  DecryptedSharedByMe,
  DecryptedSharedFile,
  DecryptedSharedLink,
  EncryptedBlobData,
} from '@/types';
import type { EncryptedBlob } from '@/lib/crypto/types';
import * as api from '@/lib/api';
import { decryptFileKeyFromSender, decryptPrivateKey } from '@/lib/crypto/keypair';
import { decryptFileKey, decryptFilename, decryptMimeType, decryptFileContentWithManifest } from '@/lib/crypto/file';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import {
  FileIcon,
  ImageIcon,
  VideoIcon,
  Music,
  FileText,
  Table as TableIcon,
  Archive,
  Download,
  User,
  Inbox,
  Send,
  Link2,
  Copy,
  Trash2,
  Lock,
  X,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { PageShell, MonoChip } from '@/components/cipher-lab';

interface SharedFilesViewProps {
  className?: string;
}

export default function SharedFilesView({ className = '' }: SharedFilesViewProps) {
  const { getVaultKey, hasVaultKey, user } = useAuth();
  const [sharedWithMe, setSharedWithMe] = useState<DecryptedSharedFile[]>([]);
  const [sharedByMe, setSharedByMe] = useState<DecryptedSharedByMe[]>([]);
  const [myLinks, setMyLinks] = useState<DecryptedSharedLink[]>([]);
  const [activeTab, setActiveTab] = useState<string>('with-me');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [keypair, setKeypair] = useState<{ privateKey: Uint8Array; publicKey: string } | null>(null);

  const toEncryptedBlob = (data: EncryptedBlobData): EncryptedBlob => ({
    ciphertext: data.ciphertext,
    algorithm: data.algorithm as 'xchacha20-poly1305',
    version: data.version,
  });

  const loadKeypair = useCallback(async () => {
    if (keypair) return keypair;

    const vaultKey = getVaultKey();
    if (!vaultKey) return null;

    try {
      const response = await api.getMyEncryptedPrivateKey();
      if (!response.success || !response.data) return null;

      const decrypted = await decryptPrivateKey(response.data.encryptedPrivateKey, vaultKey);
      const result = { privateKey: decrypted, publicKey: response.data.publicKey };
      setKeypair(result);
      return result;
    } catch {
      return null;
    }
  }, [getVaultKey, keypair]);

  const loadSharedWithMe = useCallback(async () => {
    if (!hasVaultKey) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const myKeypair = await loadKeypair();
      if (!myKeypair) {
        setError('Failed to load encryption keys');
        toast.error('Failed to load encryption keys');
        return;
      }

      const response = await api.getFilesSharedWithMe();
      if (!response.success || !response.data) {
        setError(response.error || 'Failed to load shared files');
        toast.error('Failed to load shared files', { description: response.error });
        return;
      }

      if (response.data.files.length === 0) {
        setSharedWithMe([]);
        return;
      }

      const decrypted: DecryptedSharedFile[] = [];

      for (const file of response.data.files) {
        try {
          const fileKey = await decryptFileKeyFromSender(
            file.encryptedFileKeyForRecipient.ciphertext,
            myKeypair.publicKey,
            myKeypair.privateKey
          );

          const filenameResult = await decryptFilename(toEncryptedBlob(file.encryptedFilename), fileKey);

          let mimeType = 'application/octet-stream';
          if (file.encryptedMimeType) {
            const mimeResult = await decryptMimeType(toEncryptedBlob(file.encryptedMimeType), fileKey);
            if (mimeResult.success && mimeResult.data) mimeType = mimeResult.data;
          }

          fileKey.fill(0);

          if (filenameResult.success && filenameResult.data) {
            decrypted.push({
              shareId: file.shareId,
              fileId: file.fileId,
              filename: filenameResult.data,
              mimeType,
              size: file.encryptedSize,
              ownerId: file.ownerId,
              ownerEmail: file.ownerEmail,
              recipientId: file.recipientId,
              recipientEmail: file.recipientEmail,
              sharedAt: file.sharedAt,
              permission: file.permission,
              expiresAt: file.expiresAt,
              revokedAt: file.revokedAt,
              publicKeyFingerprint: file.publicKeyFingerprint,
              encryptedFileKeyForRecipient: file.encryptedFileKeyForRecipient,
              storageMode: file.storageMode || 'single',
              chunkManifest: file.chunkManifest ?? null,
            });
          }
        } catch { /* skip files that fail to decrypt */ }
      }

      setSharedWithMe(decrypted);
    } catch {
      setError('Failed to load shared files');
      toast.error('Failed to load shared files');
    } finally {
      setIsLoading(false);
    }
  }, [hasVaultKey, loadKeypair]);

  const loadSharedByMe = useCallback(async () => {
    if (!hasVaultKey) {
      setIsLoading(false);
      return;
    }
    const vaultKey = getVaultKey();
    if (!vaultKey) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await api.getFilesSharedByMe();
      if (!response.success || !response.data) {
        setError(response.error || 'Failed to load shared files');
        return;
      }

      const decrypted: DecryptedSharedByMe[] = [];
      for (const share of response.data.shares) {
        try {
          if (!share.encryptedFileKeyForOwner) continue;
          const fileKeyResult = await decryptFileKey(toEncryptedBlob(share.encryptedFileKeyForOwner), vaultKey);
          if (!fileKeyResult.success || !fileKeyResult.data) continue;
          const fileKey = fileKeyResult.data;

          const filenameResult = await decryptFilename(toEncryptedBlob(share.encryptedFilename), fileKey);
          let mimeType = 'application/octet-stream';
          if (share.encryptedMimeType) {
            const mimeResult = await decryptMimeType(toEncryptedBlob(share.encryptedMimeType), fileKey);
            if (mimeResult.success && mimeResult.data) mimeType = mimeResult.data;
          }
          fileKey.fill(0);

          if (filenameResult.success && filenameResult.data) {
            decrypted.push({
              ...share,
              filename: filenameResult.data,
              mimeType,
              size: share.encryptedSize,
            });
          }
        } catch { /* skip rows that fail local decryption */ }
      }
      setSharedByMe(decrypted);
    } catch {
      setError('Failed to load shared files');
    } finally {
      setIsLoading(false);
    }
  }, [getVaultKey, hasVaultKey]);

  const loadMyLinks = useCallback(async () => {
    const vaultKey = getVaultKey();
    if (!vaultKey) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await api.listMyLinks();
      if (!response.success || !response.data) {
        setError(response.error || 'Failed to load shared links');
        return;
      }

      const decrypted: DecryptedSharedLink[] = [];
      for (const link of response.data.links) {
        try {
          if (!link.encryptedFileKey || !link.encryptedFilename) continue;
          const fileKeyResult = await decryptFileKey(toEncryptedBlob(link.encryptedFileKey), vaultKey);
          if (!fileKeyResult.success || !fileKeyResult.data) continue;
          const fileKey = fileKeyResult.data;

          const filenameResult = await decryptFilename(toEncryptedBlob(link.encryptedFilename), fileKey);
          let mimeType = 'application/octet-stream';
          if (link.encryptedMimeType) {
            const mimeResult = await decryptMimeType(toEncryptedBlob(link.encryptedMimeType), fileKey);
            if (mimeResult.success && mimeResult.data) mimeType = mimeResult.data;
          }
          fileKey.fill(0);

          if (filenameResult.success && filenameResult.data) {
            decrypted.push({
              ...link,
              filename: filenameResult.data,
              mimeType,
              size: link.encryptedSize || 0,
            });
          }
        } catch { /* skip rows that fail local decryption */ }
      }
      setMyLinks(decrypted);
    } catch {
      setError('Failed to load shared links');
    } finally {
      setIsLoading(false);
    }
  }, [getVaultKey]);

  useEffect(() => {
    if (activeTab === 'with-me') {
      loadSharedWithMe();
    } else if (activeTab === 'by-me') {
      loadSharedByMe();
    } else if (activeTab === 'links') {
      loadMyLinks();
    }
  }, [activeTab, loadSharedWithMe, loadSharedByMe, loadMyLinks]);

  const handleDownload = useCallback(async (file: DecryptedSharedFile) => {
    if (!keypair) {
      toast.error('Encryption keys not loaded');
      return;
    }

    try {
      setProgress(`Downloading ${file.filename}...`);

      const downloadResponse = await api.downloadFile(file.fileId);
      if (!downloadResponse.success || !downloadResponse.data) {
        toast.error('Download failed', { description: downloadResponse.error });
        return;
      }

      setProgress(`Decrypting ${file.filename}...`);

      const fileKey = await decryptFileKeyFromSender(
        file.encryptedFileKeyForRecipient.ciphertext,
        keypair.publicKey,
        keypair.privateKey
      );

      const decryptResult = await decryptFileContentWithManifest(
        downloadResponse.data,
        fileKey,
        file.storageMode === 'chunked' ? file.chunkManifest ?? null : null
      );
      fileKey.fill(0);

      if (!decryptResult.success || !decryptResult.data) {
        toast.error('Failed to decrypt file');
        return;
      }

      const arrayBuffer = new ArrayBuffer(decryptResult.data.length);
      new Uint8Array(arrayBuffer).set(decryptResult.data);
      const blob = new Blob([arrayBuffer], { type: file.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Downloaded ${file.filename}`);
    } catch {
      toast.error('Download failed', { description: 'An unexpected error occurred' });
    } finally {
      setProgress(null);
    }
  }, [keypair]);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (mimeType: string) => {
    const cls = 'size-5';
    if (mimeType.startsWith('image/')) return <ImageIcon className={`${cls} text-pink-500`} />;
    if (mimeType.startsWith('video/')) return <VideoIcon className={`${cls} text-purple-500`} />;
    if (mimeType.startsWith('audio/')) return <Music className={`${cls} text-green-500`} />;
    if (mimeType.includes('pdf')) return <FileText className={`${cls} text-red-500`} />;
    if (mimeType.includes('document') || mimeType.includes('word')) return <FileText className={`${cls} text-blue-500`} />;
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return <TableIcon className={`${cls} text-emerald-500`} />;
    if (mimeType.includes('zip') || mimeType.includes('archive')) return <Archive className={`${cls} text-amber-500`} />;
    return <FileIcon className={`${cls} text-muted-foreground`} />;
  };

  return (
    <PageShell className={`p-4 sm:p-6 lg:p-8 min-w-0 overflow-hidden ${className}`}>
      {progress && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm"
        >
          <Spinner className="size-4" />
          <span className="text-foreground font-medium">{progress}</span>
        </motion.div>
      )}

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex items-center justify-between rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          <span>{error}</span>
          <Button variant="ghost" size="icon-xs" onClick={() => setError(null)}>
            <X className="size-3.5" />
          </Button>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary mb-3">
          § VAULT · 03_SHARING
        </div>
        <h1 className="text-3xl sm:text-4xl font-medium tracking-[-0.03em] leading-[1.05] text-foreground">
          Shared
          <span
            className="font-normal italic text-primary ml-1"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            files
          </span>
          <span className="text-primary">.</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
          Envelope-encrypted with each recipient&apos;s public key. Backend never sees plaintext.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <MonoChip tone="primary">X25519-SEALED-BOX</MonoChip>
          <MonoChip tone="ok">FINGERPRINT-VERIFIED</MonoChip>
          <MonoChip>STRONG-REVOCATION</MonoChip>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="with-me" className="gap-1.5">
              <Inbox className="size-4" />
              Shared with me
            </TabsTrigger>
            <TabsTrigger value="by-me" className="gap-1.5">
              <Send className="size-4" />
              Shared by me
            </TabsTrigger>
            <TabsTrigger value="links" className="gap-1.5">
              <Link2 className="size-4" />
              Shared Links
            </TabsTrigger>
          </TabsList>

          <TabsContent value="with-me">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Spinner className="size-6" />
                <p className="text-sm text-muted-foreground">Loading shared files...</p>
              </div>
            ) : sharedWithMe.length === 0 ? (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                <Empty className="py-16">
                  <EmptyHeader>
                    <EmptyMedia variant="icon"><Inbox /></EmptyMedia>
                    <EmptyTitle>No files shared with you</EmptyTitle>
                    <EmptyDescription>When someone shares a file with you, it will appear here.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </motion.div>
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent bg-muted/30">
                      <TableHead>Name</TableHead>
                      <TableHead className="hidden sm:table-cell">From</TableHead>
                      <TableHead className="hidden sm:table-cell">Size</TableHead>
                      <TableHead className="hidden md:table-cell">Shared</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sharedWithMe.map((file, index) => (
                      <motion.tr
                        key={file.shareId}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: index * 0.03 }}
                        className="group border-b border-border transition-colors hover:bg-muted/50"
                      >
                        <TableCell>
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="size-9 rounded-lg bg-muted/80 flex items-center justify-center shrink-0">
                              {getFileIcon(file.mimeType)}
                            </div>
                            <span className="font-medium text-foreground truncate text-sm">{file.filename}</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <div className="size-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <User className="size-3 text-primary" />
                            </div>
                            <span className="truncate max-w-[150px]">{file.ownerEmail}</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                          {formatSize(file.size)}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                          {new Date(file.sharedAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleDownload(file)}
                          >
                            <Download className="size-4" />
                          </Button>
                        </TableCell>
                      </motion.tr>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="by-me">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Spinner className="size-6" />
                <p className="text-sm text-muted-foreground">Loading shared files...</p>
              </div>
            ) : sharedByMe.length === 0 ? (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                <Empty className="py-16">
                  <EmptyHeader>
                    <EmptyMedia variant="icon"><Send /></EmptyMedia>
                    <EmptyTitle>No files shared by you</EmptyTitle>
                    <EmptyDescription>Files you share with others will appear here.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </motion.div>
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent bg-muted/30">
                      <TableHead>Name</TableHead>
                      <TableHead className="hidden sm:table-cell">Shared with</TableHead>
                      <TableHead className="hidden md:table-cell">Size</TableHead>
                      <TableHead className="hidden sm:table-cell">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sharedByMe.map((share, index) => (
                      <motion.tr
                        key={share.shareId}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: index * 0.03 }}
                        className="border-b border-border transition-colors hover:bg-muted/50"
                      >
                        <TableCell>
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="size-9 rounded-lg bg-muted/80 flex items-center justify-center shrink-0">
                              {getFileIcon(share.mimeType)}
                            </div>
                            <span className="font-medium text-foreground truncate text-sm">{share.filename}</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <div className="flex items-center gap-2.5">
                            <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                              <Send className="size-4 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <span className="block text-sm font-medium text-foreground truncate">{share.recipientEmail}</span>
                              {share.publicKeyFingerprint && (
                                <span className="block text-xs text-muted-foreground font-mono truncate">
                                  {share.publicKeyFingerprint}
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                          {formatSize(share.size)}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                          {new Date(share.sharedAt).toLocaleDateString()}
                        </TableCell>
                      </motion.tr>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="links">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Spinner className="size-6" />
                <p className="text-sm text-muted-foreground">Loading shared links...</p>
              </div>
            ) : myLinks.length === 0 ? (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                <Empty className="py-16">
                  <EmptyHeader>
                    <EmptyMedia variant="icon"><Link2 /></EmptyMedia>
                    <EmptyTitle>No shared links</EmptyTitle>
                    <EmptyDescription>When you create a share link for a file, it will appear here.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </motion.div>
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent bg-muted/30">
                      <TableHead>Link</TableHead>
                      <TableHead className="hidden sm:table-cell">Downloads</TableHead>
                      <TableHead className="hidden sm:table-cell">Status</TableHead>
                      <TableHead className="hidden md:table-cell">Created</TableHead>
                      <TableHead className="w-20" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {myLinks.map((link, index) => (
                      <motion.tr
                        key={link.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: index * 0.03 }}
                        className="group border-b border-border transition-colors hover:bg-muted/50"
                      >
                        <TableCell>
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="size-9 rounded-lg bg-muted/80 flex items-center justify-center shrink-0">
                              {getFileIcon(link.mimeType)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{link.filename}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                {link.passwordProtected && (
                                  <Lock className="size-3 text-amber-500" />
                                )}
                                <span className="text-xs text-muted-foreground">
                                  {formatSize(link.size)} · ...{link.token.slice(-12)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                          {link.downloadCount}
                          {link.maxDownloads && ` / ${link.maxDownloads}`}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant={link.isActive ? 'default' : 'secondary'} className="text-xs">
                            {link.isActive ? 'Active' : 'Revoked'}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                          {new Date(link.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => {
                                toast.info('Full link cannot be recovered', {
                                  description: 'Create a new link to copy it again.',
                                });
                              }}
                              title="Full link cannot be recovered"
                            >
                              <Copy className="size-4" />
                            </Button>
                            {link.isActive && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="text-destructive hover:text-destructive"
                                onClick={async () => {
                                  const res = await api.revokeLink(link.token);
                                  if (res.success) {
                                    toast.success('Link revoked');
                                    loadMyLinks();
                                  } else {
                                    toast.error('Failed to revoke link');
                                  }
                                }}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </motion.tr>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </motion.div>
    </PageShell>
  );
}
