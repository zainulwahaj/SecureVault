'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import type { DecryptedFile, EncryptedBlobData } from '@/types';
import type { EncryptedBlob } from '@/lib/crypto/types';
import { decryptFileMetadata } from '@/lib/crypto';
import * as api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import {
  Trash2,
  Undo2,
  AlertTriangle,
  FileIcon,
  ImageIcon,
  VideoIcon,
  Music,
  FileText,
  Clock,
} from 'lucide-react';

export default function TrashView() {
  const { getVaultKey, hasVaultKey } = useAuth();
  const { confirm } = useConfirm();
  const [files, setFiles] = useState<DecryptedFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const toEncryptedBlob = (data: EncryptedBlobData): EncryptedBlob => ({
    ciphertext: data.ciphertext,
    algorithm: data.algorithm as 'xchacha20-poly1305',
    version: data.version,
  });

  const loadTrash = useCallback(async () => {
    if (!hasVaultKey) return;
    const vaultKey = getVaultKey();
    if (!vaultKey) return;

    setIsLoading(true);
    try {
      const response = await api.listTrash();
      if (!response.success || !response.data) return;

      const decrypted: DecryptedFile[] = [];
      for (const file of response.data.files) {
        const result = await decryptFileMetadata(
          toEncryptedBlob(file.encryptedFileKey),
          toEncryptedBlob(file.encryptedFilename),
          file.encryptedMimeType ? toEncryptedBlob(file.encryptedMimeType) : null,
          vaultKey
        );
        if (result.success && result.data) {
          decrypted.push({
            id: file.id,
            filename: result.data.filename,
            mimeType: result.data.mimeType,
            size: file.encryptedSize,
            folderId: file.folderId ?? null,
            deletedAt: file.deletedAt ?? null,
            createdAt: file.createdAt,
            encryptedFileKey: file.encryptedFileKey,
          });
        }
      }
      setFiles(decrypted);
    } catch {
      toast.error('Failed to load trash');
    } finally {
      setIsLoading(false);
    }
  }, [getVaultKey, hasVaultKey]);

  useEffect(() => {
    loadTrash();
  }, [loadTrash]);

  const handleRestore = useCallback(async (file: DecryptedFile) => {
    try {
      const result = await api.restoreFile(file.id);
      if (!result.success) {
        toast.error('Restore failed', { description: result.error });
        return;
      }
      setFiles(prev => prev.filter(f => f.id !== file.id));
      toast.success('File restored', { description: `"${file.filename}" has been restored` });
    } catch {
      toast.error('Restore failed');
    }
  }, []);

  const handlePermanentDelete = useCallback(async (file: DecryptedFile) => {
    const confirmed = await confirm({
      title: 'Permanently Delete',
      message: `Are you sure you want to permanently delete "${file.filename}"? This cannot be undone.`,
      confirmLabel: 'Delete Forever',
      variant: 'destructive',
    });
    if (!confirmed) return;

    try {
      const result = await api.deleteFile(file.id, true);
      if (!result.success) {
        toast.error('Delete failed', { description: result.error });
        return;
      }
      setFiles(prev => prev.filter(f => f.id !== file.id));
      toast.success('Permanently deleted', { description: `"${file.filename}" is gone forever` });
    } catch {
      toast.error('Delete failed');
    }
  }, [confirm]);

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
    return <FileIcon className={`${cls} text-muted-foreground`} />;
  };

  const daysUntilPurge = (deletedAt: string | null): number | null => {
    if (!deletedAt) return null;
    const deleted = new Date(deletedAt);
    const purgeDate = new Date(deleted.getTime() + 30 * 24 * 60 * 60 * 1000);
    const remaining = Math.ceil((purgeDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    return Math.max(0, remaining);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="size-8" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="size-10 rounded-xl bg-destructive/10 flex items-center justify-center">
          <Trash2 className="size-5 text-destructive" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">Trash</h3>
          <p className="text-sm text-muted-foreground">
            Files are permanently deleted after 30 days
          </p>
        </div>
      </div>

      {files.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Trash2 />
            </EmptyMedia>
            <EmptyTitle>Trash is empty</EmptyTitle>
            <EmptyDescription>
              Deleted files will appear here for 30 days before being permanently removed.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <motion.div layout className="space-y-2">
          <AnimatePresence>
            {files.map((file, index) => {
              const days = daysUntilPurge(file.deletedAt);
              return (
                <motion.div
                  key={file.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: index * 0.05 }}
                  className="group flex items-center justify-between p-4 bg-card border border-border rounded-xl hover:shadow-sm transition-all"
                >
                  <div className="flex items-center min-w-0 flex-1 gap-4">
                    <div className="size-12 rounded-xl bg-muted flex items-center justify-center flex-shrink-0 opacity-50">
                      {getFileIcon(file.mimeType)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate line-through opacity-70">
                        {file.filename}
                      </p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>{formatSize(file.size)}</span>
                        {days !== null && (
                          <>
                            <span>·</span>
                            <span className={`flex items-center gap-1 ${days <= 7 ? 'text-destructive' : ''}`}>
                              <Clock className="size-3.5" />
                              {days} day{days !== 1 ? 's' : ''} left
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRestore(file)}
                      className="text-primary hover:bg-primary/10"
                    >
                      <Undo2 className="size-4 mr-1" />
                      Restore
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handlePermanentDelete(file)}
                      className="text-destructive hover:bg-destructive/10"
                    >
                      <AlertTriangle className="size-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
