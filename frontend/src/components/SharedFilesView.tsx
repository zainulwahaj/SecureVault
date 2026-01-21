'use client';

/**
 * SharedFilesView - Display files shared with the current user
 * 
 * SECURITY:
 * 1. Fetch encrypted file list from backend
 * 2. Decrypt private key with VaultKey
 * 3. Decrypt FileKey with private key (envelope encryption)
 * 4. Decrypt filename with FileKey
 * 5. For download: decrypt content with FileKey
 */

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import type { SharedFile, DecryptedSharedFile, EncryptedBlobData } from '@/types';
import type { EncryptedBlob } from '@/lib/crypto/types';
import * as api from '@/lib/api';
import { decryptFileKeyFromSender, decryptPrivateKey } from '@/lib/crypto/keypair';
import { decryptFilename, decryptMimeType, decryptFileContent } from '@/lib/crypto/file';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Tabs } from '@/components/ui/Tabs';
import { Spinner } from '@/components/ui/Spinner';
import { NoSharedFiles } from '@/components/ui/EmptyState';
import {
  DocumentIcon,
  PhotoIcon,
  VideoCameraIcon,
  MusicalNoteIcon,
  DocumentTextIcon,
  TableCellsIcon,
  ArchiveBoxIcon,
  ArrowDownTrayIcon,
  UserIcon,
  InboxArrowDownIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/24/outline';

interface SharedFilesViewProps {
  className?: string;
}

export default function SharedFilesView({ className = '' }: SharedFilesViewProps) {
  const { getVaultKey, hasVaultKey, user } = useAuth();
  const toast = useToast();
  const [sharedWithMe, setSharedWithMe] = useState<DecryptedSharedFile[]>([]);
  const [sharedByMe, setSharedByMe] = useState<SharedFile[]>([]);
  const [activeTab, setActiveTab] = useState<'with-me' | 'by-me'>('with-me');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  // Cache for decrypted private key
  const [keypair, setKeypair] = useState<{ privateKey: Uint8Array; publicKey: string } | null>(null);

  /**
   * Convert backend blob format to crypto EncryptedBlob
   */
  const toEncryptedBlob = (data: EncryptedBlobData): EncryptedBlob => ({
    ciphertext: data.ciphertext,
    algorithm: data.algorithm as 'xchacha20-poly1305',
    version: data.version,
  });

  /**
   * Load and cache private key
   */
  const loadKeypair = useCallback(async () => {
    if (keypair) return keypair;

    const vaultKey = getVaultKey();
    if (!vaultKey) return null;

    try {
      const response = await api.getMyEncryptedPrivateKey();
      if (!response.success || !response.data) {
        return null;
      }

      const decrypted = await decryptPrivateKey(
        response.data.encryptedPrivateKey,
        vaultKey
      );
      
      const result = { privateKey: decrypted, publicKey: response.data.publicKey };
      setKeypair(result);
      return result;
    } catch {
      return null;
    }
  }, [getVaultKey, keypair]);

  /**
   * Load files shared with me
   */
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
        toast.error('Failed to load shared files', response.error);
        return;
      }

      // If no files shared, just show empty state (not an error)
      if (response.data.files.length === 0) {
        setSharedWithMe([]);
        return;
      }

      // Decrypt metadata for each file
      const decrypted: DecryptedSharedFile[] = [];
      
      for (const file of response.data.files) {
        try {
          // Decrypt FileKey with our private key
          const fileKey = await decryptFileKeyFromSender(
            file.encryptedFileKeyForRecipient.ciphertext,
            myKeypair.publicKey,
            myKeypair.privateKey
          );

          // Decrypt filename
          const filenameResult = await decryptFilename(
            toEncryptedBlob(file.encryptedFilename),
            fileKey
          );

          // Decrypt mime type if present
          let mimeType = 'application/octet-stream';
          if (file.encryptedMimeType) {
            const mimeResult = await decryptMimeType(
              toEncryptedBlob(file.encryptedMimeType),
              fileKey
            );
            if (mimeResult.success && mimeResult.data) {
              mimeType = mimeResult.data;
            }
          }

          // Clear FileKey
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
        } catch {
          // Skip files that fail to decrypt
        }
      }

      setSharedWithMe(decrypted);
    } catch {
      setError('Failed to load shared files');
      toast.error('Failed to load shared files');
    } finally {
      setIsLoading(false);
    }
  }, [hasVaultKey, loadKeypair, toast]);

  /**
   * Load files shared by me
   */
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
    } catch (err) {
      setError('Failed to load shared files');
    } finally {
      setIsLoading(false);
    }
  }, [hasVaultKey]);

  // Load data based on active tab
  useEffect(() => {
    if (activeTab === 'with-me') {
      loadSharedWithMe();
    } else {
      loadSharedByMe();
    }
  }, [activeTab, loadSharedWithMe, loadSharedByMe]);

  /**
   * Download a shared file
   */
  const handleDownload = useCallback(async (file: DecryptedSharedFile) => {
    if (!keypair) {
      toast.error('Encryption keys not loaded');
      return;
    }

    try {
      setProgress(`Downloading ${file.filename}...`);

      // Download encrypted content
      const downloadResponse = await api.downloadFile(file.fileId);
      if (!downloadResponse.success || !downloadResponse.data) {
        toast.error('Download failed', downloadResponse.error);
        return;
      }

      setProgress(`Decrypting ${file.filename}...`);

      // Decrypt FileKey with our private key
      const fileKey = await decryptFileKeyFromSender(
        file.encryptedFileKeyForRecipient.ciphertext,
        keypair.publicKey,
        keypair.privateKey
      );

      // Decrypt content
      const decryptResult = await decryptFileContent(
        downloadResponse.data,
        fileKey
      );

      // Clear FileKey
      fileKey.fill(0);

      if (!decryptResult.success || !decryptResult.data) {
        toast.error('Failed to decrypt file');
        return;
      }

      // Create download
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
      toast.error('Download failed', 'An unexpected error occurred');
    } finally {
      setProgress(null);
    }
  }, [keypair, toast]);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (mimeType: string) => {
    const iconClass = "w-6 h-6";
    if (mimeType.startsWith('image/')) return <PhotoIcon className={`${iconClass} text-pink-500`} />;
    if (mimeType.startsWith('video/')) return <VideoCameraIcon className={`${iconClass} text-purple-500`} />;
    if (mimeType.startsWith('audio/')) return <MusicalNoteIcon className={`${iconClass} text-green-500`} />;
    if (mimeType.includes('pdf')) return <DocumentTextIcon className={`${iconClass} text-red-500`} />;
    if (mimeType.includes('document') || mimeType.includes('word')) return <DocumentTextIcon className={`${iconClass} text-blue-500`} />;
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return <TableCellsIcon className={`${iconClass} text-emerald-500`} />;
    if (mimeType.includes('zip') || mimeType.includes('archive')) return <ArchiveBoxIcon className={`${iconClass} text-amber-500`} />;
    return <DocumentIcon className={`${iconClass} text-slate-500`} />;
  };

  const tabs = [
    { id: 'with-me', label: 'Shared with me', icon: <InboxArrowDownIcon className="w-4 h-4" /> },
    { id: 'by-me', label: 'Shared by me', icon: <PaperAirplaneIcon className="w-4 h-4" /> },
  ];

  return (
    <div className={`p-6 ${className}`}>
      {/* Error Display */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-4"
          >
            <Alert variant="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress Display */}
      <AnimatePresence>
        {progress && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-4"
          >
            <Alert variant="info">
              <div className="flex items-center gap-2">
                <Spinner size="sm" />
                {progress}
              </div>
            </Alert>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tab Navigation */}
      <div className="mb-6">
        <Tabs
          tabs={tabs}
          activeTab={activeTab}
          onChange={(id) => setActiveTab(id as 'with-me' | 'by-me')}
          variant="underline"
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : activeTab === 'with-me' ? (
        /* Shared With Me */
        sharedWithMe.length === 0 ? (
          <NoSharedFiles
            title="No files shared with you"
            description="When someone shares a file with you, it will appear here."
          />
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
                  className="group flex items-center justify-between p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-soft transition-all"
                >
                  <div className="flex items-center min-w-0 flex-1 gap-4">
                    <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                      {getFileIcon(file.mimeType)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900 dark:text-white truncate" title={file.filename}>
                        {file.filename}
                      </p>
                      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                        <span>{formatSize(file.size)}</span>
                        <span>•</span>
                        <div className="flex items-center gap-1">
                          <UserIcon className="w-3.5 h-3.5" />
                          <span className="truncate">{file.ownerEmail}</span>
                        </div>
                      </div>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                        Shared {new Date(file.sharedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDownload(file)}
                    title="Download"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <ArrowDownTrayIcon className="w-4 h-4" />
                  </Button>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )
      ) : (
        /* Shared By Me */
        sharedByMe.length === 0 ? (
          <NoSharedFiles
            title="No files shared by you"
            description="Files you share with others will appear here."
          />
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
                  className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                      <PaperAirplaneIcon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        Shared with <span className="font-medium text-slate-900 dark:text-white">{share.recipientEmail}</span>
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        {new Date(share.sharedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )
      )}
    </div>
  );
}
