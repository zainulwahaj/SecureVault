'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { toast } from 'sonner';
import type { DecryptedFile, DecryptedFolder, EncryptedBlobData } from '@/types';
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
import MoveFileDialog from './MoveFileDialog';
import FilePreview, { canPreview } from './FilePreview';
import UploadDialog from './UploadDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Checkbox } from '@/components/ui/checkbox';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
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
  Table as TableIcon,
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
  Home,
  MoreHorizontal,
  ArrowUpDown,
  Upload,
  Plus,
  Filter,
  ChevronUp,
  ChevronDown,
  FolderInput,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type SortField = 'name' | 'date' | 'size';
type SortDirection = 'asc' | 'desc';

interface FileVaultProps {
  className?: string;
  onStorageUpdate?: (bytes: number, count: number) => void;
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.04 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

export default function FileVault({ className = '', onStorageUpdate }: FileVaultProps) {
  const { user, getVaultKey, hasVaultKey } = useAuth();
  const { confirm } = useConfirm();
  const [files, setFiles] = useState<DecryptedFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [shareDialogFile, setShareDialogFile] = useState<DecryptedFile | null>(null);
  const [linkDialogFile, setLinkDialogFile] = useState<DecryptedFile | null>(null);
  const [previewFile, setPreviewFile] = useState<DecryptedFile | null>(null);
  const [moveFiles, setMoveFiles] = useState<DecryptedFile[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [showSearch, setShowSearch] = useState(false);

  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<DecryptedFolder[]>([]);
  const [folders, setFolders] = useState<DecryptedFolder[]>([]);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  const username = user?.email ? user.email.split('@')[0] : 'there';

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

  useEffect(() => {
    if (onStorageUpdate) {
      const totalBytes = files.reduce((acc, file) => acc + file.size, 0);
      onStorageUpdate(totalBytes, files.length);
    }
  }, [files, onStorageUpdate]);

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
    if (e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files);
    }
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
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
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

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  }, [sortField]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="size-3" />;
    return sortDirection === 'asc' ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />;
  };

  return (
    <div
      className={`p-4 sm:p-6 lg:p-8 min-w-0 overflow-hidden ${className}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleUpload(e.target.files)}
        disabled={isUploading}
      />

      <AnimatePresence>
        {isDragOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="rounded-2xl border-2 border-dashed border-primary bg-primary/5 p-12 text-center"
            >
              <CloudUpload className="size-12 mx-auto mb-3 text-primary" />
              <p className="text-lg font-semibold text-foreground">Drop files to upload</p>
              <p className="text-sm text-muted-foreground mt-1">Files are encrypted before upload</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {uploadProgress && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm"
        >
          <Spinner className="size-4" />
          <span className="text-foreground font-medium">{uploadProgress}</span>
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
        transition={{ delay: 0.05 }}
        className="mb-6"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              Welcome back, <span className="capitalize">{username}</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {folderPath.length > 0
                ? `Browsing ${folderPath[folderPath.length - 1].name}`
                : 'Manage and access your secure file vault.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setIsCreatingFolder(true); setTimeout(() => newFolderInputRef.current?.focus(), 50); }}
              className="gap-1.5"
            >
              <Plus className="size-3.5" />
              Create
            </Button>
            <Button
              size="sm"
              onClick={() => setUploadDialogOpen(true)}
              disabled={isUploading}
              className="gap-1.5"
            >
              <Upload className="size-3.5" />
              Upload
            </Button>
          </div>
        </div>
      </motion.div>

      {(folderPath.length > 0 || currentFolderId) && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-6"
        >
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink
                  className="cursor-pointer flex items-center gap-1.5"
                  onClick={() => navigateToBreadcrumb(-1)}
                >
                  <Home className="size-3.5" />
                  Root
                </BreadcrumbLink>
              </BreadcrumbItem>
              {folderPath.map((folder, i) => (
                <BreadcrumbItem key={folder.id}>
                  <BreadcrumbSeparator />
                  {i === folderPath.length - 1 ? (
                    <BreadcrumbPage>{folder.name}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink
                      className="cursor-pointer"
                      onClick={() => navigateToBreadcrumb(i)}
                    >
                      {folder.name}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        </motion.div>
      )}

      <AnimatePresence>
        {isCreatingFolder && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6 overflow-hidden"
          >
            <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-3">
              <div className="size-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                <Folder className="size-4 text-amber-500" />
              </div>
              <Input
                ref={newFolderInputRef}
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateFolder();
                  if (e.key === 'Escape') { setIsCreatingFolder(false); setNewFolderName(''); }
                }}
                placeholder="Folder name"
                className="flex-1 h-9 border-0 bg-transparent focus-visible:ring-0 shadow-none"
              />
              <Button size="sm" onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
                Create
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => { setIsCreatingFolder(false); setNewFolderName(''); }}>
                <X className="size-4" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!isLoading && folders.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <h3 className="text-sm font-semibold text-foreground mb-3">Folders</h3>
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3"
          >
            {folders.map((folder) => (
              <motion.div key={folder.id} variants={itemVariants}>
                <button
                  className="group relative flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-all duration-200 hover:bg-accent hover:border-accent-foreground/10 hover:shadow-sm active:scale-[0.98]"
                  onClick={() => navigateToFolder(folder)}
                >
                  <div className="size-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                    <Folder className="size-4 text-amber-500" />
                  </div>
                  <span className="text-sm font-medium text-foreground truncate flex-1">
                    {folder.name}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className="opacity-0 group-hover:opacity-100 inline-flex items-center justify-center rounded-md size-7 text-muted-foreground hover:bg-background transition-all"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="size-3.5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-36">
                      <DropdownMenuItem
                        onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder); }}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="size-3.5 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </button>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      )}

      <AnimatePresence>
        {selectedFiles.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 mb-4"
          >
            <span className="text-sm font-medium text-foreground">
              {selectedFiles.size} selected
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="xs"
                onClick={() => {
                  const filesToMove = files.filter(f => selectedFiles.has(f.id));
                  setMoveFiles(filesToMove);
                }}
                className="gap-1"
              >
                <FolderInput className="size-3" />
                Move
              </Button>
              <Button
                variant="destructive"
                size="xs"
                onClick={handleBulkDelete}
                className="gap-1"
              >
                <Trash2 className="size-3" />
                Delete
              </Button>
              <Button variant="outline" size="xs" onClick={() => setSelectedFiles(new Set())}>
                Clear
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Spinner className="size-6" />
          <p className="text-sm text-muted-foreground">Decrypting your files...</p>
        </div>
      ) : files.length === 0 && folders.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.2 }}
              className="mx-auto mb-4 size-16 rounded-2xl bg-primary/10 flex items-center justify-center"
            >
              <CloudUpload className="size-8 text-primary" />
            </motion.div>
            <h3 className="text-lg font-semibold text-foreground mb-1">Your vault is empty</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
              Upload your first file to get started. All files are encrypted in your browser before upload.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button size="sm" className="gap-1.5" onClick={() => setUploadDialogOpen(true)}>
                <Upload className="size-3.5" />
                Upload Files
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  setIsCreatingFolder(true);
                  setTimeout(() => newFolderInputRef.current?.focus(), 50);
                }}
              >
                <FolderPlus className="size-3.5" />
                New Folder
              </Button>
            </div>
            <div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="size-3" />
              End-to-end encrypted
            </div>
          </div>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
        >
          {files.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-foreground">
                  Your Files
                  {filteredAndSortedFiles.length !== files.length && (
                    <span className="ml-1.5 text-muted-foreground font-normal">
                      ({filteredAndSortedFiles.length} of {files.length})
                    </span>
                  )}
                </h3>
                <div className="flex items-center gap-1.5">
                  {showSearch ? (
                    <motion.div
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: 200, opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      className="relative overflow-hidden"
                    >
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                      <Input
                        type="text"
                        placeholder="Search files..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-8 h-8 text-sm"
                        autoFocus
                      />
                    </motion.div>
                  ) : null}
                  <Button
                    variant={showSearch ? 'secondary' : 'ghost'}
                    size="icon-sm"
                    onClick={() => { setShowSearch(!showSearch); if (showSearch) setSearchQuery(''); }}
                    className="text-muted-foreground"
                  >
                    {showSearch ? <X className="size-3.5" /> : <Search className="size-3.5" />}
                  </Button>
                  <Button variant="ghost" size="icon-sm" className="text-muted-foreground">
                    <Filter className="size-3.5" />
                  </Button>
                </div>
              </div>

              {filteredAndSortedFiles.length === 0 ? (
                <div className="text-center py-12 rounded-xl border border-dashed border-border">
                  <Search className="size-8 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">No files match &ldquo;{searchQuery}&rdquo;</p>
                  <Button variant="link" size="sm" onClick={() => setSearchQuery('')} className="mt-1">
                    Clear search
                  </Button>
                </div>
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent bg-muted/30">
                        <TableHead className="w-10">
                          <Checkbox
                            checked={selectedFiles.size === filteredAndSortedFiles.length && filteredAndSortedFiles.length > 0}
                            onCheckedChange={() => toggleSelectAll()}
                          />
                        </TableHead>
                        <TableHead>
                          <Button
                            variant="ghost"
                            size="xs"
                            className="gap-1 -ml-2 text-muted-foreground hover:text-foreground font-medium"
                            onClick={() => handleSort('name')}
                          >
                            Name
                            <SortIcon field="name" />
                          </Button>
                        </TableHead>
                        <TableHead className="hidden sm:table-cell">
                          <Button
                            variant="ghost"
                            size="xs"
                            className="gap-1 -ml-2 text-muted-foreground hover:text-foreground font-medium"
                            onClick={() => handleSort('size')}
                          >
                            File Size
                            <SortIcon field="size" />
                          </Button>
                        </TableHead>
                        <TableHead className="hidden md:table-cell">
                          <Button
                            variant="ghost"
                            size="xs"
                            className="gap-1 -ml-2 text-muted-foreground hover:text-foreground font-medium"
                            onClick={() => handleSort('date')}
                          >
                            Modified
                            <SortIcon field="date" />
                          </Button>
                        </TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAndSortedFiles.map((file, index) => (
                        <motion.tr
                          key={file.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: index * 0.02 }}
                          className={`group border-b border-border transition-colors hover:bg-muted/50 ${selectedFiles.has(file.id) ? 'bg-primary/5' : ''}`}
                        >
                          <TableCell>
                            <Checkbox
                              checked={selectedFiles.has(file.id)}
                              onCheckedChange={() => toggleFileSelection(file.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="size-9 rounded-lg bg-muted/80 flex items-center justify-center shrink-0">
                                {getFileIcon(file.mimeType)}
                              </div>
                              <div className="min-w-0">
                                <span className="font-medium text-foreground truncate text-sm block" title={file.filename}>
                                  {file.filename}
                                </span>
                                <span className="text-xs text-muted-foreground sm:hidden">
                                  {formatSize(file.size)}
                                </span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                            {formatSize(file.size)}
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                            {new Date(file.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-lg size-8 text-muted-foreground hover:bg-accent hover:text-foreground opacity-0 group-hover:opacity-100 transition-all">
                                <MoreHorizontal className="size-4" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                {canPreview(file.mimeType, file.filename) && (
                                  <DropdownMenuItem onClick={() => setPreviewFile(file)}>
                                    <Eye className="size-4 mr-2" />
                                    Preview
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => handleDownload(file)}>
                                  <Download className="size-4 mr-2" />
                                  Download
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setShareDialogFile(file)}>
                                  <Share2 className="size-4 mr-2" />
                                  Share
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setLinkDialogFile(file)}>
                                  <Link className="size-4 mr-2" />
                                  Share Link
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setMoveFiles([file])}>
                                  <FolderInput className="size-4 mr-2" />
                                  Move to...
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleDelete(file)} className="text-destructive focus:text-destructive">
                                  <Trash2 className="size-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </motion.tr>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}

        </motion.div>
      )}

      <UploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        onUpload={handleUpload}
        isUploading={isUploading}
        uploadProgress={uploadProgress}
      />
      {shareDialogFile && <ShareFileDialog file={shareDialogFile} isOpen={true} onClose={() => setShareDialogFile(null)} />}
      {linkDialogFile && <LinkShareDialog file={linkDialogFile} isOpen={true} onClose={() => setLinkDialogFile(null)} />}
      <FilePreview file={previewFile} isOpen={!!previewFile} onClose={() => setPreviewFile(null)} onDownload={handleDownload} />
      <MoveFileDialog
        files={moveFiles}
        isOpen={moveFiles.length > 0}
        onClose={() => setMoveFiles([])}
        onMoved={() => { setMoveFiles([]); setSelectedFiles(new Set()); loadFiles(); }}
      />
    </div>
  );
}
