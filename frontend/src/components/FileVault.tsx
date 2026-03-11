'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { toast } from 'sonner';
import type { DecryptedFile, DecryptedFolder, EncryptedFileMetadata, EncryptedBlobData } from '@/types';
import type { EncryptedBlob } from '@/lib/crypto/types';
import {
  prepareFileForUpload,
  decryptFileMetadata,
  decryptDownloadedFile,
  encryptMetadata,
  decryptMetadata,
} from '@/lib/crypto';
import * as api from '@/lib/api';
import ShareFileDialog from './ShareFileDialog';
import LinkShareDialog from './LinkShareDialog';
import FilePreview, { canPreview } from './FilePreview';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '@/components/ui/empty';
import {
  CloudUpload,
  FileIcon,
  ImageIcon,
  VideoIcon,
  Music,
  FileText,
  Table,
  Archive,
  Download,
  Trash2,
  Share2,
  Link,
  Lock,
  Eye,
  Search,
  X,
  Folder,
  FolderPlus,
  ChevronRight,
  Home,
  AlertCircle,
  Info,
} from 'lucide-react';

type SortField = 'name' | 'date' | 'size';
type SortDirection = 'asc' | 'desc';

interface FileVaultProps {
  className?: string;
}

export default function FileVault({ className = '' }: FileVaultProps) {
  const { getVaultKey, hasVaultKey } = useAuth();
  const { confirm } = useConfirm();
  const [files, setFiles] = useState<DecryptedFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [shareDialogFile, setShareDialogFile] = useState<DecryptedFile | null>(null);
  const [linkDialogFile, setLinkDialogFile] = useState<DecryptedFile | null>(null);
  const [previewFile, setPreviewFile] = useState<DecryptedFile | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<DecryptedFolder[]>([]);
  const [folders, setFolders] = useState<DecryptedFolder[]>([]);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  const toEncryptedBlob = (data: EncryptedBlobData): EncryptedBlob => ({
    ciphertext: data.ciphertext,
    algorithm: data.algorithm as 'xchacha20-poly1305',
    version: data.version,
  });

  const loadFiles = useCallback(async () => {
    if (!hasVaultKey) return;
    const vaultKey = getVaultKey();
    if (!vaultKey) return;

    setIsLoading(true);
    setError(null);

    try {
      const [filesResponse, foldersResponse] = await Promise.all([
        api.listFiles(currentFolderId),
        api.listFolders(currentFolderId),
      ]);

      if (filesResponse.success && filesResponse.data) {
        const decryptedFiles: DecryptedFile[] = [];
        for (const file of filesResponse.data.files) {
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
              folderId: file.folderId ?? null,
              deletedAt: file.deletedAt ?? null,
              createdAt: file.createdAt,
              encryptedFileKey: file.encryptedFileKey,
            });
          }
        }
        setFiles(decryptedFiles);
      } else {
        setError(filesResponse.error || 'Failed to load files');
      }

      if (foldersResponse.success && foldersResponse.data) {
        const decryptedFolders: DecryptedFolder[] = [];
        for (const folder of foldersResponse.data.folders) {
          const nameResult = await decryptMetadata(
            toEncryptedBlob(folder.encryptedName),
            vaultKey
          );
          if (nameResult.success && nameResult.data) {
            decryptedFolders.push({
              id: folder.id,
              parentId: folder.parentId,
              name: nameResult.data,
              createdAt: folder.createdAt,
            });
          }
        }
        setFolders(decryptedFolders.sort((a, b) => a.name.localeCompare(b.name)));
      }
    } catch {
      setError('Failed to load files');
      toast.error('Failed to load files', { description: 'An unexpected error occurred' });
    } finally {
      setIsLoading(false);
    }
  }, [getVaultKey, hasVaultKey, currentFolderId]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const handleUpload = useCallback(async (selectedFiles: FileList | null) => {
    if (!selectedFiles || selectedFiles.length === 0) return;

    const vaultKey = getVaultKey();
    if (!vaultKey) {
      toast.error('Not authenticated', { description: 'Please unlock your vault first' });
      return;
    }

    setIsUploading(true);
    let successCount = 0;

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setUploadProgress(`Encrypting ${file.name}...`);

        const prepResult = await prepareFileForUpload(file, vaultKey);
        if (!prepResult.success || !prepResult.data) {
          toast.error('Encryption failed', { description: `Failed to encrypt ${file.name}` });
          continue;
        }

        setUploadProgress(`Uploading ${file.name}...`);

        const uploadResult = await api.uploadFile(
          prepResult.data.encryptedContent,
          {
            encryptedFileKey: prepResult.data.encryptedFileKey,
            encryptedFilename: prepResult.data.encryptedFilename,
            encryptedMimeType: prepResult.data.encryptedMimeType,
          },
          currentFolderId,
        );

        if (!uploadResult.success) {
          toast.error('Upload failed', { description: `Failed to upload ${file.name}` });
          continue;
        }
        successCount++;
      }

      await loadFiles();

      if (successCount > 0) {
        toast.success('Upload complete', { description: `${successCount} file${successCount > 1 ? 's' : ''} uploaded securely` });
      }
    } catch {
      toast.error('Upload failed', { description: 'An unexpected error occurred' });
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  }, [getVaultKey, loadFiles, currentFolderId]);

  const handleDownload = useCallback(async (file: DecryptedFile) => {
    const vaultKey = getVaultKey();
    if (!vaultKey) {
      toast.error('Not authenticated');
      return;
    }

    try {
      setUploadProgress(`Downloading ${file.filename}...`);

      const downloadResult = await api.downloadFile(file.id);
      if (!downloadResult.success || !downloadResult.data) {
        toast.error(`Failed to download: ${downloadResult.error}`);
        return;
      }

      setUploadProgress(`Decrypting ${file.filename}...`);

      const decryptResult = await decryptDownloadedFile(
        downloadResult.data,
        toEncryptedBlob(file.encryptedFileKey),
        vaultKey
      );

      if (!decryptResult.success || !decryptResult.data) {
        toast.error(`Failed to decrypt: ${decryptResult.error}`);
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
      toast.error('Download failed. Please try again.');
    } finally {
      setUploadProgress(null);
    }
  }, [getVaultKey]);

  const handleDelete = useCallback(async (file: DecryptedFile) => {
    const confirmed = await confirm({
      title: 'Delete File',
      message: `Are you sure you want to delete "${file.filename}"?`,
      confirmLabel: 'Delete',
      variant: 'destructive',
    });
    if (!confirmed) return;

    try {
      const result = await api.deleteFile(file.id);
      if (!result.success) {
        toast.error('Delete failed', { description: result.error });
        return;
      }

      setFiles(prev => prev.filter(f => f.id !== file.id));
      setSelectedFiles(prev => {
        const next = new Set(prev);
        next.delete(file.id);
        return next;
      });
      toast.success('File deleted', { description: `"${file.filename}" has been deleted` });
    } catch {
      toast.error('Delete failed', { description: 'An unexpected error occurred' });
    }
  }, [confirm]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedFiles.size === 0) return;

    const count = selectedFiles.size;
    const confirmed = await confirm({
      title: 'Delete Files',
      message: `Are you sure you want to delete ${count} file${count > 1 ? 's' : ''}? This action cannot be undone.`,
      confirmLabel: 'Delete All',
      variant: 'destructive',
    });

    if (!confirmed) return;

    let successCount = 0;
    let failCount = 0;

    const fileIds = Array.from(selectedFiles);
    for (const fileId of fileIds) {
      try {
        const result = await api.deleteFile(fileId);
        if (result.success) successCount++;
        else failCount++;
      } catch {
        failCount++;
      }
    }

    setFiles(prev => prev.filter(f => !selectedFiles.has(f.id)));
    setSelectedFiles(new Set());
    setIsSelectionMode(false);

    if (successCount > 0) {
      toast.success('Files deleted', { description: `${successCount} file${successCount > 1 ? 's' : ''} deleted` });
    }
    if (failCount > 0) {
      toast.error('Some deletions failed', { description: `${failCount} file${failCount > 1 ? 's' : ''} could not be deleted` });
    }
  }, [selectedFiles, confirm]);

  const toggleFileSelection = useCallback((fileId: string) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }, []);

  const exitSelectionMode = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedFiles(new Set());
  }, []);

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

  const navigateToFolder = useCallback((folder: DecryptedFolder) => {
    setFolderPath(prev => [...prev, folder]);
    setCurrentFolderId(folder.id);
    setSearchQuery('');
  }, []);

  const navigateToBreadcrumb = useCallback((index: number) => {
    if (index < 0) {
      setFolderPath([]);
      setCurrentFolderId(null);
    } else {
      const newPath = folderPath.slice(0, index + 1);
      setFolderPath(newPath);
      setCurrentFolderId(newPath[newPath.length - 1].id);
    }
    setSearchQuery('');
  }, [folderPath]);

  const handleCreateFolder = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name) return;

    const vaultKey = getVaultKey();
    if (!vaultKey) return;

    try {
      const encResult = await encryptMetadata(name, vaultKey);
      if (!encResult.success || !encResult.data) {
        toast.error('Failed to encrypt folder name');
        return;
      }

      const result = await api.createFolder(encResult.data, currentFolderId);
      if (!result.success) {
        toast.error('Failed to create folder', { description: result.error });
        return;
      }

      setNewFolderName('');
      setIsCreatingFolder(false);
      toast.success('Folder created', { description: `"${name}" created` });
      await loadFiles();
    } catch {
      toast.error('Failed to create folder');
    }
  }, [newFolderName, getVaultKey, currentFolderId, loadFiles]);

  const handleDeleteFolder = useCallback(async (folder: DecryptedFolder) => {
    const confirmed = await confirm({
      title: 'Delete Folder',
      message: `Are you sure you want to delete "${folder.name}"? Files inside will be moved to the root.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
    });
    if (!confirmed) return;

    try {
      const result = await api.deleteFolder(folder.id);
      if (!result.success) {
        toast.error('Delete failed', { description: result.error });
        return;
      }
      setFolders(prev => prev.filter(f => f.id !== folder.id));
      toast.success('Folder deleted', { description: `"${folder.name}" deleted` });
    } catch {
      toast.error('Failed to delete folder');
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
    if (mimeType.includes('document') || mimeType.includes('word')) return <FileText className={`${cls} text-blue-500`} />;
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return <Table className={`${cls} text-emerald-500`} />;
    if (mimeType.includes('zip') || mimeType.includes('archive')) return <Archive className={`${cls} text-amber-500`} />;
    return <FileIcon className={`${cls} text-muted-foreground`} />;
  };

  const filteredAndSortedFiles = useMemo(() => {
    let result = [...files];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(file => file.filename.toLowerCase().includes(query));
    }

    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name': comparison = a.filename.localeCompare(b.filename); break;
        case 'date': comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(); break;
        case 'size': comparison = a.size - b.size; break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [files, searchQuery, sortField, sortDirection]);

  const toggleSelectAll = useCallback(() => {
    if (selectedFiles.size === filteredAndSortedFiles.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(filteredAndSortedFiles.map(f => f.id)));
    }
  }, [selectedFiles.size, filteredAndSortedFiles]);

  const totalStorageUsed = useMemo(() => files.reduce((acc, file) => acc + file.size, 0), [files]);

  const formatStorageSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

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
        {uploadProgress && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="mb-4">
            <Alert>
              <Info className="size-4" />
              <AlertDescription className="flex items-center gap-2">
                <Spinner className="size-3" />
                {uploadProgress}
              </AlertDescription>
            </Alert>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload Area */}
      <motion.div
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer
          ${isDragOver ? 'border-primary bg-primary/5' : 'border-border bg-muted/50 hover:border-primary/50 hover:bg-muted'}
          ${isUploading ? 'opacity-50 pointer-events-none' : ''}
        `}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => handleUpload(e.target.files)} disabled={isUploading} />
        <motion.div animate={isDragOver ? { scale: 1.1, y: -5 } : { scale: 1, y: 0 }} className="size-16 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center">
          <CloudUpload className="size-8 text-primary" />
        </motion.div>
        <p className="text-foreground font-medium">
          {isUploading ? 'Encrypting and uploading...' : 'Drag and drop files here, or click to select'}
        </p>
        <div className="flex items-center justify-center gap-2 mt-2 text-xs text-muted-foreground">
          <Lock className="size-3.5" />
          <span>Files are encrypted in your browser before upload</span>
        </div>
      </motion.div>

      {files.length > 0 && (
        <div className="mt-4 flex items-center justify-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-muted rounded-lg text-sm">
            <div className="size-2 rounded-full bg-primary" />
            <span className="text-muted-foreground">
              Storage used: <span className="font-medium text-foreground">{formatStorageSize(totalStorageUsed)}</span>
            </span>
            <span className="text-muted-foreground/50">•</span>
            <span className="text-muted-foreground">{files.length} file{files.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
      )}

      <div className="mt-8">
        {(folderPath.length > 0 || currentFolderId) && (
          <nav className="flex items-center gap-1 mb-4 text-sm overflow-x-auto">
            <button onClick={() => navigateToBreadcrumb(-1)} className="flex items-center gap-1 px-2 py-1 rounded-md text-muted-foreground hover:bg-muted transition-colors flex-shrink-0">
              <Home className="size-4" /> Root
            </button>
            {folderPath.map((folder, i) => (
              <div key={folder.id} className="flex items-center gap-1 flex-shrink-0">
                <ChevronRight className="size-3.5 text-muted-foreground/50" />
                <button onClick={() => navigateToBreadcrumb(i)} className={`px-2 py-1 rounded-md transition-colors ${i === folderPath.length - 1 ? 'font-medium text-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                  {folder.name}
                </button>
              </div>
            ))}
          </nav>
        )}

        {!isLoading && (folders.length > 0 || isCreatingFolder) && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-muted-foreground">Folders</h4>
              {!isCreatingFolder && (
                <button onClick={() => { setIsCreatingFolder(true); setTimeout(() => newFolderInputRef.current?.focus(), 50); }} className="flex items-center gap-1 px-2 py-1 text-xs text-primary hover:bg-primary/10 rounded-md transition-colors">
                  <FolderPlus className="size-3.5" /> New Folder
                </button>
              )}
            </div>

            {isCreatingFolder && (
              <div className="flex items-center gap-2 mb-2">
                <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0"><Folder className="size-5 text-primary" /></div>
                <Input ref={newFolderInputRef} type="text" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') { setIsCreatingFolder(false); setNewFolderName(''); } }} placeholder="Folder name" className="flex-1" />
                <Button size="sm" onClick={handleCreateFolder}>Create</Button>
                <Button variant="ghost" size="sm" onClick={() => { setIsCreatingFolder(false); setNewFolderName(''); }}><X className="size-4" /></Button>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {folders.map((folder) => (
                <div key={folder.id} className="group flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer" onClick={() => navigateToFolder(folder)}>
                  <Folder className="size-5 text-amber-500 flex-shrink-0" />
                  <span className="text-sm font-medium text-foreground truncate flex-1">{folder.name}</span>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder); }} className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-all" title="Delete folder">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {!isLoading && folders.length === 0 && isCreatingFolder && (
          <div className="flex items-center gap-2 mb-4">
            <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0"><Folder className="size-5 text-primary" /></div>
            <Input ref={newFolderInputRef} type="text" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') { setIsCreatingFolder(false); setNewFolderName(''); } }} placeholder="Folder name" className="flex-1" />
            <Button size="sm" onClick={handleCreateFolder}>Create</Button>
            <Button variant="ghost" size="sm" onClick={() => { setIsCreatingFolder(false); setNewFolderName(''); }}><X className="size-4" /></Button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <h3 className="text-lg font-semibold text-foreground">
            Your Files
            {files.length > 0 && <span className="ml-2 text-sm font-normal text-muted-foreground">({filteredAndSortedFiles.length}{searchQuery && ` of ${files.length}`})</span>}
          </h3>

          {files.length > 0 && (
            <div className="flex items-center gap-3">
              {folders.length === 0 && !isCreatingFolder && (
                <button onClick={() => { setIsCreatingFolder(true); setTimeout(() => newFolderInputRef.current?.focus(), 50); }} className="flex items-center gap-1 px-3 py-2 text-sm text-primary hover:bg-primary/10 rounded-lg transition-colors" title="Create folder">
                  <FolderPlus className="size-4" />
                </button>
              )}

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input type="text" placeholder="Search files..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 w-48" />
              </div>

              <div className="flex items-center gap-1">
                {(['name', 'date', 'size'] as SortField[]).map((field) => (
                  <button key={field} onClick={() => handleSort(field)} className={`px-3 py-2 text-sm rounded-lg transition-colors ${sortField === field ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`} title={`Sort by ${field}`}>
                    {field.charAt(0).toUpperCase() + field.slice(1)}
                    {sortField === field && <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                  </button>
                ))}
              </div>

              <button onClick={() => setIsSelectionMode(!isSelectionMode)} className={`px-3 py-2 text-sm rounded-lg transition-colors ${isSelectionMode ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}>
                {isSelectionMode ? 'Done' : 'Select'}
              </button>
            </div>
          )}
        </div>

        {isSelectionMode && (
          <div className="flex items-center justify-between p-3 mb-4 bg-muted rounded-lg border border-border">
            <div className="flex items-center gap-3">
              <button onClick={toggleSelectAll} className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-foreground hover:bg-background rounded-md transition-colors">
                <Checkbox checked={selectedFiles.size === filteredAndSortedFiles.length && filteredAndSortedFiles.length > 0} onCheckedChange={() => toggleSelectAll()} />
                {selectedFiles.size === filteredAndSortedFiles.length && filteredAndSortedFiles.length > 0 ? 'Deselect All' : 'Select All'}
              </button>
              <span className="text-sm text-muted-foreground">{selectedFiles.size} selected</span>
            </div>
            <div className="flex items-center gap-2">
              {selectedFiles.size > 0 && (
                <Button variant="ghost" size="sm" onClick={handleBulkDelete} className="text-destructive hover:bg-destructive/10">
                  <Trash2 className="size-4 mr-1" /> Delete ({selectedFiles.size})
                </Button>
              )}
              <button onClick={exitSelectionMode} className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-background">
                <X className="size-4" />
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Spinner className="size-8" /></div>
        ) : files.length === 0 ? (
          <Empty className="py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon"><CloudUpload /></EmptyMedia>
              <EmptyTitle>Your vault is empty</EmptyTitle>
              <EmptyDescription>Upload your first file to get started. All files are encrypted before leaving your browser.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent><Button onClick={() => fileInputRef.current?.click()}>Upload Files</Button></EmptyContent>
          </Empty>
        ) : filteredAndSortedFiles.length === 0 ? (
          <div className="text-center py-12">
            <Search className="size-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No files match &ldquo;{searchQuery}&rdquo;</p>
            <button onClick={() => setSearchQuery('')} className="mt-2 text-sm text-primary hover:underline">Clear search</button>
          </div>
        ) : (
          <motion.div layout className="space-y-2">
            <AnimatePresence>
              {filteredAndSortedFiles.map((file, index) => (
                <motion.div
                  key={file.id} layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ delay: index * 0.05 }}
                  className={`group flex items-center justify-between p-4 bg-card border rounded-xl hover:shadow-sm transition-all ${selectedFiles.has(file.id) ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}
                  onClick={isSelectionMode ? () => toggleFileSelection(file.id) : undefined}
                >
                  <div className="flex items-center min-w-0 flex-1 gap-4">
                    {isSelectionMode && <Checkbox checked={selectedFiles.has(file.id)} onCheckedChange={() => toggleFileSelection(file.id)} onClick={(e) => e.stopPropagation()} />}
                    <div className="size-12 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">{getFileIcon(file.mimeType)}</div>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate" title={file.filename}>{file.filename}</p>
                      <p className="text-sm text-muted-foreground">{formatSize(file.size)} • {new Date(file.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className={`flex items-center gap-1 ml-4 transition-opacity ${isSelectionMode ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'}`}>
                    {canPreview(file.mimeType, file.filename) && (
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setPreviewFile(file); }} title="Preview"><Eye className="size-4" /></Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setShareDialogFile(file); }} title="Share with user"><Share2 className="size-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setLinkDialogFile(file); }} title="Share via link"><Link className="size-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleDownload(file); }} title="Download"><Download className="size-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleDelete(file); }} className="text-destructive hover:bg-destructive/10" title="Delete"><Trash2 className="size-4" /></Button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {shareDialogFile && <ShareFileDialog file={shareDialogFile} isOpen={true} onClose={() => setShareDialogFile(null)} />}
      {linkDialogFile && <LinkShareDialog file={linkDialogFile} isOpen={true} onClose={() => setLinkDialogFile(null)} />}
      <FilePreview file={previewFile} isOpen={!!previewFile} onClose={() => setPreviewFile(null)} onDownload={handleDownload} />
    </div>
  );
}
