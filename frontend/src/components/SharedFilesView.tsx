'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import type { SharedFile, DecryptedSharedFile, EncryptedBlobData } from '@/types';
import type { EncryptedBlob } from '@/lib/crypto/types';
import * as api from '@/lib/api';
import { decryptFileKeyFromSender, decryptPrivateKey } from '@/lib/crypto/keypair';
import { decryptFilename, decryptMimeType, decryptFileContent } from '@/lib/crypto/file';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Spinner } from '@/components/ui/spinner';
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
  Table,
  Archive,
  Download,
  User,
  Inbox,
  Send,
  AlertCircle,
  Info,
  X,
} from 'lucide-react';

interface SharedFilesViewProps {
  className?: string;
}

export default function SharedFilesView({ className = '' }: SharedFilesViewProps) {
  const { getVaultKey, hasVaultKey, user } = useAuth();
  const [sharedWithMe, setSharedWithMe] = useState<DecryptedSharedFile[]>([]);
  const [sharedByMe, setSharedByMe] = useState<SharedFile[]>([]);
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
    if (!hasVaultKey) return;

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
              encryptedFileKeyForRecipient: file.encryptedFileKeyForRecipient,
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
    if (!hasVaultKey) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await api.getFilesSharedByMe();
      if (!response.success || !response.data) {
        setError(response.error || 'Failed to load shared files');
        return;
      }
      setSharedByMe(response.data.shares);
    } catch {
      setError('Failed to load shared files');
    } finally {
      setIsLoading(false);
    }
  }, [hasVaultKey]);

  useEffect(() => {
    if (activeTab === 'with-me') {
      loadSharedWithMe();
    } else {
      loadSharedByMe();
    }
  }, [activeTab, loadSharedWithMe, loadSharedByMe]);

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

      const decryptResult = await decryptFileContent(downloadResponse.data, fileKey);
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
    const cls = 'size-6';
    if (mimeType.startsWith('image/')) return <ImageIcon className={`${cls} text-pink-500`} />;
    if (mimeType.startsWith('video/')) return <VideoIcon className={`${cls} text-purple-500`} />;
    if (mimeType.startsWith('audio/')) return <Music className={`${cls} text-green-500`} />;
    if (mimeType.includes('pdf')) return <FileText className={`${cls} text-red-500`} />;
    if (mimeType.includes('document') || mimeType.includes('word')) return <FileText className={`${cls} text-blue-500`} />;
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return <Table className={`${cls} text-emerald-500`} />;
    if (mimeType.includes('zip') || mimeType.includes('archive')) return <Archive className={`${cls} text-amber-500`} />;
    return <FileIcon className={`${cls} text-muted-foreground`} />;
  };

  return (
    <div className={`p-6 ${className}`}>
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="mb-4">
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription className="flex items-center justify-between">
                {error}
                <button onClick={() => setError(null)} className="ml-2 hover:opacity-70"><X className="size-4" /></button>
              </AlertDescription>
            </Alert>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {progress && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="mb-4">
            <Alert>
              <Info className="size-4" />
              <AlertDescription className="flex items-center gap-2">
                <Spinner className="size-3" />
                {progress}
              </AlertDescription>
            </Alert>
          </motion.div>
        )}
      </AnimatePresence>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
        <TabsList>
          <TabsTrigger value="with-me">
            <Inbox className="size-4 mr-2" />
            Shared with me
          </TabsTrigger>
          <TabsTrigger value="by-me">
            <Send className="size-4 mr-2" />
            Shared by me
          </TabsTrigger>
        </TabsList>

        <TabsContent value="with-me" className="mt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Spinner className="size-8" /></div>
          ) : sharedWithMe.length === 0 ? (
            <Empty className="py-12">
              <EmptyHeader>
                <EmptyMedia variant="icon"><Inbox /></EmptyMedia>
                <EmptyTitle>No files shared with you</EmptyTitle>
                <EmptyDescription>When someone shares a file with you, it will appear here.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <motion.div layout className="space-y-2">
              <AnimatePresence>
                {sharedWithMe.map((file, index) => (
                  <motion.div
                    key={file.shareId}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ delay: index * 0.05 }}
                    className="group flex items-center justify-between p-4 bg-card border border-border rounded-xl hover:border-primary/50 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-center min-w-0 flex-1 gap-4">
                      <div className="size-12 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                        {getFileIcon(file.mimeType)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground truncate" title={file.filename}>
                          {file.filename}
                        </p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>{formatSize(file.size)}</span>
                          <span>•</span>
                          <div className="flex items-center gap-1">
                            <User className="size-3.5" />
                            <span className="truncate">{file.ownerEmail}</span>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground/70 mt-0.5">
                          Shared {new Date(file.sharedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDownload(file)}
                      title="Download"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Download className="size-4" />
                    </Button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </TabsContent>

        <TabsContent value="by-me" className="mt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Spinner className="size-8" /></div>
          ) : sharedByMe.length === 0 ? (
            <Empty className="py-12">
              <EmptyHeader>
                <EmptyMedia variant="icon"><Send /></EmptyMedia>
                <EmptyTitle>No files shared by you</EmptyTitle>
                <EmptyDescription>Files you share with others will appear here.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <motion.div layout className="space-y-2">
              <AnimatePresence>
                {sharedByMe.map((share, index) => (
                  <motion.div
                    key={share.shareId}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-center justify-between p-4 bg-card border border-border rounded-xl"
                  >
                    <div className="flex items-center gap-4">
                      <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Send className="size-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Shared with <span className="font-medium text-foreground">{share.recipientEmail}</span>
                        </p>
                        <p className="text-xs text-muted-foreground/70">
                          {new Date(share.sharedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
