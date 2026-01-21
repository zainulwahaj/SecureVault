'use client';

/**
 * FileVault Component - Encrypted File Storage UI
 * 
 * SECURITY:
 * - All encryption/decryption happens client-side
 * - VaultKey is obtained from AuthContext (memory only)
 * - Backend never sees plaintext filenames or content
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import type { DecryptedFile, EncryptedFileMetadata, EncryptedBlobData } from '@/types';
import type { EncryptedBlob } from '@/lib/crypto/types';
import {
  prepareFileForUpload,
  decryptFileMetadata,
  decryptDownloadedFile,
} from '@/lib/crypto';
import * as api from '@/lib/api';
import ShareFileDialog from './ShareFileDialog';
import FilePreview, { canPreview } from './FilePreview';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { EmptyState, NoFiles } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { ProgressBar } from '@/components/ui/ProgressBar';
import {
  CloudArrowUpIcon,
  DocumentIcon,
  PhotoIcon,
  VideoCameraIcon,
  MusicalNoteIcon,
  DocumentTextIcon,
  TableCellsIcon,
  ArchiveBoxIcon,
  ArrowDownTrayIcon,
  TrashIcon,
  ShareIcon,
  LockClosedIcon,
  EyeIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowsUpDownIcon,
  CheckIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

type SortField = 'name' | 'date' | 'size';
type SortDirection = 'asc' | 'desc';

interface FileVaultProps {
  className?: string;
}

export default function FileVault({ className = '' }: FileVaultProps) {
  const { getVaultKey, hasVaultKey } = useAuth();
  const toast = useToast();
  const { confirmDelete, confirm } = useConfirm();
  const [files, setFiles] = useState<DecryptedFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [shareDialogFile, setShareDialogFile] = useState<DecryptedFile | null>(null);
  const [previewFile, setPreviewFile] = useState<DecryptedFile | null>(null);
  
  // Search and sort state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  
  // Bulk selection state
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  /**
   * Convert backend blob format to crypto EncryptedBlob
   */
  const toEncryptedBlob = (data: EncryptedBlobData): EncryptedBlob => ({
    ciphertext: data.ciphertext,
    algorithm: data.algorithm as 'xchacha20-poly1305',
    version: data.version,
  });

  /**
   * Load and decrypt file list from backend
   */
  const loadFiles = useCallback(async () => {
    if (!hasVaultKey) return;
    
    const vaultKey = getVaultKey();
    if (!vaultKey) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await api.listFiles();
      if (!response.success || !response.data) {
        setError(response.error || 'Failed to load files');
        toast.error('Failed to load files', response.error);
        return;
      }

      // Decrypt metadata for each file
      const decryptedFiles: DecryptedFile[] = [];
      
      for (const file of response.data.files) {
        const metadataResult = await decryptFileMetadata(
          toEncryptedBlob(file.encryptedFileKey),
          toEncryptedBlob(file.encryptedFilename),
          file.encryptedMimeType ? toEncryptedBlob(file.encryptedMimeType) : null,
          vaultKey
        );
        
        if (metadataResult.success && metadataResult.data) {
          decryptedFiles.push({
            id: file.id,
            filename: metadataResult.data.filename,
            mimeType: metadataResult.data.mimeType,
            size: file.encryptedSize,
            createdAt: file.createdAt,
            encryptedFileKey: file.encryptedFileKey,
          });
        }
      }

      setFiles(decryptedFiles);
    } catch {
      setError('Failed to load files');
      toast.error('Failed to load files', 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [getVaultKey, hasVaultKey, toast]);

  // Load files on mount
  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  /**
   * Handle file upload
   */
  const handleUpload = useCallback(async (selectedFiles: FileList | null) => {
    if (!selectedFiles || selectedFiles.length === 0) return;
    
    const vaultKey = getVaultKey();
    if (!vaultKey) {
      toast.error('Not authenticated', 'Please unlock your vault first');
      return;
    }

    setIsUploading(true);
    let successCount = 0;
    
    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setUploadProgress(`Encrypting ${file.name}...`);

        // Encrypt file client-side
        const prepResult = await prepareFileForUpload(file, vaultKey);
        if (!prepResult.success || !prepResult.data) {
          toast.error('Encryption failed', `Failed to encrypt ${file.name}`);
          continue;
        }

        setUploadProgress(`Uploading ${file.name}...`);

        // Upload encrypted file
        const uploadResult = await api.uploadFile(
          prepResult.data.encryptedContent,
          {
            encryptedFileKey: prepResult.data.encryptedFileKey,
            encryptedFilename: prepResult.data.encryptedFilename,
            encryptedMimeType: prepResult.data.encryptedMimeType,
          }
        );

        if (!uploadResult.success) {
          toast.error('Upload failed', `Failed to upload ${file.name}`);
          continue;
        }
        successCount++;
      }

      // Reload file list
      await loadFiles();
      
      if (successCount > 0) {
        toast.success('Upload complete', `${successCount} file${successCount > 1 ? 's' : ''} uploaded securely`);
      }
    } catch {
      toast.error('Upload failed', 'An unexpected error occurred');
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  }, [getVaultKey, loadFiles, toast]);

  /**
   * Handle file download
   */
  const handleDownload = useCallback(async (file: DecryptedFile) => {
    const vaultKey = getVaultKey();
    if (!vaultKey) {
      toast.error('Not authenticated');
      return;
    }

    try {
      setUploadProgress(`Downloading ${file.filename}...`);

      // Download encrypted content
      const downloadResult = await api.downloadFile(file.id);
      if (!downloadResult.success || !downloadResult.data) {
        toast.error(`Failed to download: ${downloadResult.error}`);
        return;
      }

      setUploadProgress(`Decrypting ${file.filename}...`);

      // Decrypt file content
      const decryptResult = await decryptDownloadedFile(
        downloadResult.data,
        toEncryptedBlob(file.encryptedFileKey),
        vaultKey
      );

      if (!decryptResult.success || !decryptResult.data) {
        toast.error(`Failed to decrypt: ${decryptResult.error}`);
        return;
      }

      // Create download link - create new ArrayBuffer from Uint8Array
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

    } catch (err) {
      toast.error('Download failed. Please try again.');
    } finally {
      setUploadProgress(null);
    }
  }, [getVaultKey, toast]);

  /**
   * Handle file deletion
   */
  const handleDelete = useCallback(async (file: DecryptedFile) => {
    const confirmed = await confirmDelete(file.filename);
    if (!confirmed) return;

    try {
      const result = await api.deleteFile(file.id);
      if (!result.success) {
        toast.error('Delete failed', result.error);
        return;
      }

      // Remove from local state
      setFiles(prev => prev.filter(f => f.id !== file.id));
      setSelectedFiles(prev => {
        const next = new Set(prev);
        next.delete(file.id);
        return next;
      });
      toast.success('File deleted', `"${file.filename}" has been deleted`);
    } catch {
      toast.error('Delete failed', 'An unexpected error occurred');
    }
  }, [confirmDelete, toast]);

  /**
   * Handle bulk file deletion
   */
  const handleBulkDelete = useCallback(async () => {
    if (selectedFiles.size === 0) return;
    
    const count = selectedFiles.size;
    const confirmed = await confirm({
      type: 'danger',
      title: 'Delete Files',
      message: `Are you sure you want to delete ${count} file${count > 1 ? 's' : ''}? This action cannot be undone.`,
      confirmLabel: 'Delete All',
      icon: 'trash',
    });
    
    if (!confirmed) return;

    let successCount = 0;
    let failCount = 0;
    
    const fileIds = Array.from(selectedFiles);
    for (const fileId of fileIds) {
      try {
        const result = await api.deleteFile(fileId);
        if (result.success) {
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
    }

    // Update local state
    setFiles(prev => prev.filter(f => !selectedFiles.has(f.id)));
    setSelectedFiles(new Set());
    setIsSelectionMode(false);
    
    if (successCount > 0) {
      toast.success('Files deleted', `${successCount} file${successCount > 1 ? 's' : ''} deleted`);
    }
    if (failCount > 0) {
      toast.error('Some deletions failed', `${failCount} file${failCount > 1 ? 's' : ''} could not be deleted`);
    }
  }, [selectedFiles, confirm, toast]);

  /**
   * Toggle file selection
   */
  const toggleFileSelection = useCallback((fileId: string) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  }, []);

  /**
   * Exit selection mode
   */
  const exitSelectionMode = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedFiles(new Set());
  }, []);

  /**
   * Drag and drop handlers
   */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleUpload(e.dataTransfer.files);
  }, [handleUpload]);

  /**
   * Format file size for display
   */
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  /**
   * Get icon for file type
   */
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

  /**
   * Filter and sort files
   */
  const filteredAndSortedFiles = useMemo(() => {
    let result = [...files];
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(file => 
        file.filename.toLowerCase().includes(query)
      );
    }
    
    // Sort files
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = a.filename.localeCompare(b.filename);
          break;
        case 'date':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'size':
          comparison = a.size - b.size;
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    
    return result;
  }, [files, searchQuery, sortField, sortDirection]);

  /**
   * Select/deselect all files
   */
  const toggleSelectAll = useCallback(() => {
    if (selectedFiles.size === filteredAndSortedFiles.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(filteredAndSortedFiles.map(f => f.id)));
    }
  }, [selectedFiles.size, filteredAndSortedFiles]);

  /**
   * Calculate total storage used
   */
  const totalStorageUsed = useMemo(() => {
    return files.reduce((acc, file) => acc + file.size, 0);
  }, [files]);

  /**
   * Format storage size for display
   */
  const formatStorageSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  /**
   * Toggle sort direction or change sort field
   */
  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  }, [sortField]);

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
        {uploadProgress && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-4"
          >
            <Alert variant="info">
              <div className="flex items-center gap-2">
                <Spinner size="sm" />
                {uploadProgress}
              </div>
            </Alert>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload Area */}
      <motion.div
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer
          ${isDragOver 
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' 
            : 'border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 hover:border-primary-300 dark:hover:border-primary-700 hover:bg-slate-100 dark:hover:bg-slate-800'
          }
          ${isUploading ? 'opacity-50 pointer-events-none' : ''}
        `}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleUpload(e.target.files)}
          disabled={isUploading}
        />
        <motion.div
          animate={isDragOver ? { scale: 1.1, y: -5 } : { scale: 1, y: 0 }}
          className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center"
        >
          <CloudArrowUpIcon className="w-8 h-8 text-primary-600 dark:text-primary-400" />
        </motion.div>
        <p className="text-slate-700 dark:text-slate-300 font-medium">
          {isUploading 
            ? 'Encrypting and uploading...' 
            : 'Drag and drop files here, or click to select'
          }
        </p>
        <div className="flex items-center justify-center gap-2 mt-2 text-xs text-slate-500 dark:text-slate-400">
          <LockClosedIcon className="w-3.5 h-3.5" />
          <span>Files are encrypted in your browser before upload</span>
        </div>
      </motion.div>

      {/* Storage Usage Indicator */}
      {files.length > 0 && (
        <div className="mt-4 flex items-center justify-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-sm">
            <div className="w-2 h-2 rounded-full bg-primary-500"></div>
            <span className="text-slate-600 dark:text-slate-400">
              Storage used: <span className="font-medium text-slate-900 dark:text-white">{formatStorageSize(totalStorageUsed)}</span>
            </span>
            <span className="text-slate-400 dark:text-slate-500">•</span>
            <span className="text-slate-600 dark:text-slate-400">
              {files.length} file{files.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      )}

      {/* File List */}
      <div className="mt-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            Your Files
            {files.length > 0 && (
              <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">
                ({filteredAndSortedFiles.length}{searchQuery && ` of ${files.length}`})
              </span>
            )}
          </h3>
          
          {/* Search and Sort Controls */}
          {files.length > 0 && (
            <div className="flex items-center gap-3">
              {/* Search Input */}
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search files..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-4 py-2 w-48 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              
              {/* Sort Dropdown */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleSort('name')}
                  className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                    sortField === 'name'
                      ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                  title="Sort by name"
                >
                  Name
                  {sortField === 'name' && (
                    <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
                <button
                  onClick={() => handleSort('date')}
                  className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                    sortField === 'date'
                      ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                  title="Sort by date"
                >
                  Date
                  {sortField === 'date' && (
                    <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
                <button
                  onClick={() => handleSort('size')}
                  className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                    sortField === 'size'
                      ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                  title="Sort by size"
                >
                  Size
                  {sortField === 'size' && (
                    <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              </div>
              
              {/* Select Mode Toggle */}
              <button
                onClick={() => setIsSelectionMode(!isSelectionMode)}
                className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                  isSelectionMode
                    ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
                title={isSelectionMode ? 'Exit selection mode' : 'Select files'}
              >
                {isSelectionMode ? 'Done' : 'Select'}
              </button>
            </div>
          )}
        </div>

        {/* Bulk Actions Bar */}
        {isSelectionMode && (
          <div className="flex items-center justify-between p-3 mb-4 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors"
              >
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                  selectedFiles.size === filteredAndSortedFiles.length && filteredAndSortedFiles.length > 0
                    ? 'bg-primary-600 border-primary-600 text-white'
                    : 'border-slate-400 dark:border-slate-500'
                }`}>
                  {selectedFiles.size === filteredAndSortedFiles.length && filteredAndSortedFiles.length > 0 && (
                    <CheckIcon className="w-3 h-3" />
                  )}
                </div>
                {selectedFiles.size === filteredAndSortedFiles.length && filteredAndSortedFiles.length > 0
                  ? 'Deselect All'
                  : 'Select All'
                }
              </button>
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {selectedFiles.size} selected
              </span>
            </div>
            <div className="flex items-center gap-2">
              {selectedFiles.size > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleBulkDelete}
                  className="text-error-600 hover:bg-error-50 dark:hover:bg-error-900/20"
                >
                  <TrashIcon className="w-4 h-4 mr-1" />
                  Delete ({selectedFiles.size})
                </Button>
              )}
              <button
                onClick={exitSelectionMode}
                className="p-1.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : files.length === 0 ? (
          <NoFiles
            title="Your vault is empty"
            description="Upload your first file to get started. All files are encrypted before leaving your browser."
            action={{
              label: "Upload Files",
              onClick: () => fileInputRef.current?.click(),
            }}
          />
        ) : filteredAndSortedFiles.length === 0 ? (
          <div className="text-center py-12">
            <MagnifyingGlassIcon className="w-12 h-12 mx-auto text-slate-400 mb-4" />
            <p className="text-slate-600 dark:text-slate-400">No files match "{searchQuery}"</p>
            <button
              onClick={() => setSearchQuery('')}
              className="mt-2 text-sm text-primary-600 dark:text-primary-400 hover:underline"
            >
              Clear search
            </button>
          </div>
        ) : (
          <motion.div layout className="space-y-2">
            <AnimatePresence>
              {filteredAndSortedFiles.map((file, index) => (
                <motion.div
                  key={file.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: index * 0.05 }}
                  className={`group flex items-center justify-between p-4 bg-white dark:bg-slate-800 border rounded-xl hover:shadow-soft transition-all ${
                    selectedFiles.has(file.id)
                      ? 'border-primary-500 dark:border-primary-500 bg-primary-50 dark:bg-primary-900/10'
                      : 'border-slate-200 dark:border-slate-700 hover:border-primary-300 dark:hover:border-primary-700'
                  }`}
                  onClick={isSelectionMode ? () => toggleFileSelection(file.id) : undefined}
                >
                  <div className="flex items-center min-w-0 flex-1 gap-4">
                    {/* Selection Checkbox */}
                    {isSelectionMode && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFileSelection(file.id);
                        }}
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          selectedFiles.has(file.id)
                            ? 'bg-primary-600 border-primary-600 text-white'
                            : 'border-slate-400 dark:border-slate-500 hover:border-primary-500'
                        }`}
                      >
                        {selectedFiles.has(file.id) && <CheckIcon className="w-3 h-3" />}
                      </button>
                    )}
                    <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                      {getFileIcon(file.mimeType)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 dark:text-white truncate" title={file.filename}>
                        {file.filename}
                      </p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {formatSize(file.size)} • {new Date(file.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className={`flex items-center gap-1 ml-4 transition-opacity ${
                    isSelectionMode ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'
                  }`}>
                    {canPreview(file.mimeType, file.filename) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); setPreviewFile(file); }}
                        title="Preview"
                      >
                        <EyeIcon className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); setShareDialogFile(file); }}
                      title="Share"
                    >
                      <ShareIcon className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); handleDownload(file); }}
                      title="Download"
                    >
                      <ArrowDownTrayIcon className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); handleDelete(file); }}
                      className="text-error-600 hover:bg-error-50 dark:hover:bg-error-900/20"
                      title="Delete"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {/* Share Dialog */}
      {shareDialogFile && (
        <ShareFileDialog
          file={shareDialogFile}
          isOpen={true}
          onClose={() => setShareDialogFile(null)}
        />
      )}

      {/* File Preview */}
      <FilePreview
        file={previewFile}
        isOpen={!!previewFile}
        onClose={() => setPreviewFile(null)}
        onDownload={handleDownload}
      />
    </div>
  );
}
