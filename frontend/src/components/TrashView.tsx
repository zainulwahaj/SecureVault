'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import type { DecryptedFile, EncryptedBlobData } from '@/types';
import type { EncryptedBlob } from '@/lib/crypto/types';
import { decryptFileMetadata } from '@/lib/crypto';
import * as api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  MoreHorizontal,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { PageShell, MonoChip } from '@/components/cipher-lab';

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
    const cls = 'size-5';
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

  return (
    <PageShell className="p-4 sm:p-6 lg:p-8 min-w-0 overflow-hidden">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary mb-3">
          § VAULT · 04_TRASH
        </div>
        <h1 className="text-3xl sm:text-4xl font-medium tracking-[-0.03em] leading-[1.05] text-foreground">
          Soft-deleted
          <span
            className="font-normal italic text-primary ml-1"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            artifacts
          </span>
          <span className="text-primary">.</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
          Auto-purge runs on a per-account retention policy. Files here can still be restored.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <MonoChip tone="danger">PURGE-PENDING</MonoChip>
          <MonoChip>POLICY-DRIVEN</MonoChip>
        </div>
      </motion.div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Spinner className="size-6" />
          <p className="text-sm text-muted-foreground">Loading trash...</p>
        </div>
      ) : files.length === 0 ? (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
          <Empty className="py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon"><Trash2 /></EmptyMedia>
              <EmptyTitle>Trash is empty</EmptyTitle>
              <EmptyDescription>Deleted files will appear here for 30 days before being permanently removed.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl border border-border overflow-hidden"
        >
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent bg-muted/30">
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Size</TableHead>
                <TableHead className="hidden md:table-cell">Time left</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.map((file, index) => {
                const days = daysUntilPurge(file.deletedAt);
                return (
                  <motion.tr
                    key={file.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.03 }}
                    className="group border-b border-border transition-colors hover:bg-muted/50"
                  >
                    <TableCell>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="size-9 rounded-lg bg-muted/80 flex items-center justify-center shrink-0 opacity-60">
                          {getFileIcon(file.mimeType)}
                        </div>
                        <span className="text-sm text-muted-foreground truncate">{file.filename}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                      {formatSize(file.size)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {days !== null && (
                        <Badge
                          variant="outline"
                          className={`gap-1 font-normal ${days <= 7 ? 'border-destructive/30 text-destructive bg-destructive/5' : 'text-muted-foreground'}`}
                        >
                          <Clock className="size-3" />
                          {days}d left
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-lg size-8 text-muted-foreground hover:bg-accent hover:text-foreground opacity-0 group-hover:opacity-100 transition-all">
                          <MoreHorizontal className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => handleRestore(file)}>
                            <Undo2 className="size-4 mr-2" />
                            Restore
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handlePermanentDelete(file)} className="text-destructive focus:text-destructive">
                            <AlertTriangle className="size-4 mr-2" />
                            Delete Forever
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </motion.tr>
                );
              })}
            </TableBody>
          </Table>
        </motion.div>
      )}
    </PageShell>
  );
}
