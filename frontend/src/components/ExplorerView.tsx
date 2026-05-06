'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import type {
  DecryptedFile,
  DecryptedFolder,
  EncryptedBlobData,
  FolderResponse,
} from '@/types';
import type { EncryptedBlob } from '@/lib/crypto/types';
import {
  prepareFileForUpload,
  decryptFileMetadata,
  decryptDownloadedFile,
  encryptMetadata,
  decryptMetadata,
} from '@/lib/crypto';
import * as api from '@/lib/api';
import { FilesystemItem, type FileNode } from '@/components/ui/filesystem-item';
import FilePreviewDialog from './FilePreviewDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  CloudUpload,
  FolderPlus,
  Pencil,
  Trash2,
  FolderTree,
  Upload,
  FileIcon,
  MoreHorizontal,
  GripVertical,
  ChevronRight,
  FolderInput,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const toEncryptedBlob = (data: EncryptedBlobData): EncryptedBlob => ({
  ciphertext: data.ciphertext,
  algorithm: data.algorithm as 'xchacha20-poly1305',
  version: data.version,
});

interface FolderData {
  folder: DecryptedFolder;
  files: DecryptedFile[];
  subfolders: DecryptedFolder[];
}

export default function ExplorerView() {
  const { getVaultKey, hasVaultKey } = useAuth();
  const [treeData, setTreeData] = useState<FileNode[]>([]);
  const [allFolders, setAllFolders] = useState<DecryptedFolder[]>([]);
  const [allFiles, setAllFiles] = useState<DecryptedFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameFolderName, setRenameFolderName] = useState('');
  const renameFolderInputRef = useRef<HTMLInputElement>(null);

  const [previewFile, setPreviewFile] = useState<DecryptedFile | null>(null);

  const [draggedFileId, setDraggedFileId] = useState<string | null>(null);

  const loadAllData = useCallback(async () => {
    if (!hasVaultKey) return;
    const vaultKey = getVaultKey();
    if (!vaultKey) return;

    setIsLoading(true);

    try {
      const [rootFilesRes, rootFoldersRes] = await Promise.all([
        api.listFiles(null),
        api.listFolders(null),
      ]);

      const folders: DecryptedFolder[] = [];
      const files: DecryptedFile[] = [];

      if (rootFoldersRes.success && rootFoldersRes.data) {
        for (const f of rootFoldersRes.data.folders) {
          const nameResult = await decryptMetadata(toEncryptedBlob(f.encryptedName), vaultKey);
          if (nameResult.success && nameResult.data) {
            folders.push({ id: f.id, parentId: f.parentId, name: nameResult.data, createdAt: f.createdAt });
          }
        }
      }

      if (rootFilesRes.success && rootFilesRes.data) {
        for (const f of rootFilesRes.data.files) {
          const metaResult = await decryptFileMetadata(
            toEncryptedBlob(f.encryptedFileKey),
            toEncryptedBlob(f.encryptedFilename),
            f.encryptedMimeType ? toEncryptedBlob(f.encryptedMimeType) : null,
            vaultKey
          );
          if (metaResult.success && metaResult.data) {
            files.push({
              id: f.id,
              filename: metaResult.data.filename,
              mimeType: metaResult.data.mimeType,
              size: f.encryptedSize,
              folderId: f.folderId ?? null,
              deletedAt: f.deletedAt ?? null,
              createdAt: f.createdAt,
              encryptedFileKey: f.encryptedFileKey,
            });
          }
        }
      }

      const subfolderMap: Map<string, DecryptedFolder[]> = new Map();
      const subfileMap: Map<string, DecryptedFile[]> = new Map();

      for (const folder of folders) {
        const [subFilesRes, subFoldersRes] = await Promise.all([
          api.listFiles(folder.id),
          api.listFolders(folder.id),
        ]);

        const subFiles: DecryptedFile[] = [];
        if (subFilesRes.success && subFilesRes.data) {
          for (const f of subFilesRes.data.files) {
            const metaResult = await decryptFileMetadata(
              toEncryptedBlob(f.encryptedFileKey),
              toEncryptedBlob(f.encryptedFilename),
              f.encryptedMimeType ? toEncryptedBlob(f.encryptedMimeType) : null,
              vaultKey
            );
            if (metaResult.success && metaResult.data) {
              subFiles.push({
                id: f.id,
                filename: metaResult.data.filename,
                mimeType: metaResult.data.mimeType,
                size: f.encryptedSize,
                folderId: f.folderId ?? null,
                deletedAt: f.deletedAt ?? null,
                createdAt: f.createdAt,
                encryptedFileKey: f.encryptedFileKey,
              });
            }
          }
        }
        subfileMap.set(folder.id, subFiles);

        const subFolders: DecryptedFolder[] = [];
        if (subFoldersRes.success && subFoldersRes.data) {
          for (const sf of subFoldersRes.data.folders) {
            const nameResult = await decryptMetadata(toEncryptedBlob(sf.encryptedName), vaultKey);
            if (nameResult.success && nameResult.data) {
              subFolders.push({ id: sf.id, parentId: sf.parentId, name: nameResult.data, createdAt: sf.createdAt });
            }
          }
        }
        subfolderMap.set(folder.id, subFolders);
      }

      const allFoldersCollected = [...folders];
      const allFilesCollected = [...files];
      subfolderMap.forEach(sf => allFoldersCollected.push(...sf));
      subfileMap.forEach(sf => allFilesCollected.push(...sf));

      setAllFolders(allFoldersCollected);
      setAllFiles(allFilesCollected);

      const tree = buildTree(folders, files, subfolderMap, subfileMap);
      setTreeData(tree);
    } catch {
      toast.error('Failed to load file tree');
    } finally {
      setIsLoading(false);
    }
  }, [getVaultKey, hasVaultKey]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  function buildTree(
    rootFolders: DecryptedFolder[],
    rootFiles: DecryptedFile[],
    subfolderMap: Map<string, DecryptedFolder[]>,
    subfileMap: Map<string, DecryptedFile[]>,
  ): FileNode[] {
    const folderToNode = (folder: DecryptedFolder): FileNode => {
      const subFolders = subfolderMap.get(folder.id) || [];
      const subFiles = subfileMap.get(folder.id) || [];
      return {
        id: folder.id,
        name: folder.name,
        type: 'folder',
        nodes: [
          ...subFolders.sort((a, b) => a.name.localeCompare(b.name)).map(folderToNode),
          ...subFiles.sort((a, b) => a.filename.localeCompare(b.filename)).map(fileToNode),
        ],
      };
    };

    const fileToNode = (file: DecryptedFile): FileNode => ({
      id: file.id,
      name: file.filename,
      type: 'file',
      mimeType: file.mimeType,
      size: file.size,
    });

    return [
      ...rootFolders.sort((a, b) => a.name.localeCompare(b.name)).map(folderToNode),
      ...rootFiles.sort((a, b) => a.filename.localeCompare(b.filename)).map(fileToNode),
    ];
  }

  function handleNodeSelect(node: FileNode) {
    setSelectedNode(node);
    if (node.type === 'folder') {
      setSelectedFolderId(node.id);
    }
  }

  function handleNodeDoubleClick(node: FileNode) {
    if (node.type === 'file') {
      const file = allFiles.find(f => f.id === node.id);
      if (file) setPreviewFile(file);
    }
  }

  async function handleUpload(filesToUpload: FileList | File[]) {
    const vaultKey = getVaultKey();
    if (!vaultKey) return;

    setIsUploading(true);
    let successCount = 0;

    for (const file of Array.from(filesToUpload)) {
      const prepResult = await prepareFileForUpload(file, vaultKey);
      if (!prepResult.success || !prepResult.data) {
        toast.error(`Failed to encrypt ${file.name}`);
        continue;
      }

      const uploadResult = await api.uploadFile(
        prepResult.data.encryptedContent,
        {
          encryptedFileKey: prepResult.data.encryptedFileKey,
          encryptedFilename: prepResult.data.encryptedFilename,
          encryptedMimeType: prepResult.data.encryptedMimeType,
        },
        selectedFolderId,
      );

      if (uploadResult.success) {
        successCount++;
      } else {
        toast.error(`Failed to upload ${file.name}`);
      }
    }

    if (successCount > 0) {
      toast.success(`Uploaded ${successCount} file${successCount > 1 ? 's' : ''}`);
      await loadAllData();
    }
    setIsUploading(false);
  }

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return;
    const vaultKey = getVaultKey();
    if (!vaultKey) return;

    const encResult = await encryptMetadata(newFolderName.trim(), vaultKey);
    if (!encResult.success || !encResult.data) {
      toast.error('Failed to encrypt folder name');
      return;
    }

    const result = await api.createFolder(encResult.data, selectedFolderId);
    if (result.success) {
      toast.success(`Folder "${newFolderName.trim()}" created`);
      setNewFolderName('');
      setIsCreatingFolder(false);
      await loadAllData();
    } else {
      toast.error(result.error || 'Failed to create folder');
    }
  }

  async function handleRenameFolder() {
    if (!renamingFolderId || !renameFolderName.trim()) return;
    const vaultKey = getVaultKey();
    if (!vaultKey) return;

    const encResult = await encryptMetadata(renameFolderName.trim(), vaultKey);
    if (!encResult.success || !encResult.data) {
      toast.error('Failed to encrypt folder name');
      return;
    }

    const result = await api.renameFolder(renamingFolderId, encResult.data);
    if (result.success) {
      toast.success('Folder renamed');
      setRenamingFolderId(null);
      setRenameFolderName('');
      await loadAllData();
    } else {
      toast.error(result.error || 'Failed to rename folder');
    }
  }

  async function handleDeleteFolder(folderId: string) {
    const result = await api.deleteFolder(folderId);
    if (result.success) {
      toast.success('Folder deleted');
      if (selectedFolderId === folderId) {
        setSelectedFolderId(null);
        setSelectedNode(null);
      }
      await loadAllData();
    } else {
      toast.error(result.error || 'Failed to delete folder');
    }
  }

  async function handleMoveFile(fileId: string, targetFolderId: string | null) {
    const result = await api.moveFile(fileId, targetFolderId);
    if (result.success) {
      toast.success('File moved');
      await loadAllData();
    } else {
      toast.error('Failed to move file');
    }
  }

  async function handleDownloadFile(file: DecryptedFile) {
    const vaultKey = getVaultKey();
    if (!vaultKey) return;

    const downloadResult = await api.downloadFile(file.id);
    if (!downloadResult.success || !downloadResult.data) {
      toast.error('Failed to download');
      return;
    }

    const decryptResult = await decryptDownloadedFile(
      downloadResult.data,
      toEncryptedBlob(file.encryptedFileKey),
      vaultKey,
    );

    if (!decryptResult.success || !decryptResult.data) {
      toast.error('Failed to decrypt');
      return;
    }

    const blob = new Blob([decryptResult.data], { type: file.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleDeleteFile(fileId: string) {
    const result = await api.deleteFile(fileId);
    if (result.success) {
      toast.success('File deleted');
      if (selectedNode?.id === fileId) setSelectedNode(null);
      await loadAllData();
    } else {
      toast.error('Failed to delete file');
    }
  }

  function handleDragStart(e: React.DragEvent, fileId: string) {
    e.dataTransfer.setData('text/plain', fileId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedFileId(fileId);
  }

  function handleTreeDragStart(e: React.DragEvent, node: FileNode) {
    if (node.type === 'file') {
      e.dataTransfer.setData('text/plain', node.id);
      e.dataTransfer.effectAllowed = 'move';
      setDraggedFileId(node.id);
    }
  }

  function handleTreeDropOnFolder(e: React.DragEvent, folderId: string) {
    e.preventDefault();
    const fileId = e.dataTransfer.getData('text/plain');
    if (fileId) {
      handleMoveFile(fileId, folderId);
    }
    setDraggedFileId(null);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleTreeDrop(e: React.DragEvent, targetFolderId: string | null) {
    e.preventDefault();
    const fileId = e.dataTransfer.getData('text/plain');
    if (fileId) {
      handleMoveFile(fileId, targetFolderId);
    }
    setDraggedFileId(null);
  }

  function handleDropOnUploadZone(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);

    if (draggedFileId) {
      setDraggedFileId(null);
      return;
    }

    if (e.dataTransfer.files?.length > 0) {
      handleUpload(e.dataTransfer.files);
    }
  }

  const selectedFolder = selectedFolderId ? allFolders.find(f => f.id === selectedFolderId) : null;
  const selectedFileDetails = selectedNode?.type === 'file' ? allFiles.find(f => f.id === selectedNode.id) : null;

  const filesInSelectedFolder = selectedFolderId
    ? allFiles.filter(f => f.folderId === selectedFolderId)
    : allFiles.filter(f => !f.folderId);

  useEffect(() => {
    if (isCreatingFolder && newFolderInputRef.current) {
      newFolderInputRef.current.focus();
    }
  }, [isCreatingFolder]);

  useEffect(() => {
    if (renamingFolderId && renameFolderInputRef.current) {
      renameFolderInputRef.current.focus();
    }
  }, [renamingFolderId]);

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  function getFileIcon(mimeType: string) {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType === 'application/pdf') return '📄';
    if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
    if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📊';
    if (mimeType.startsWith('video/')) return '🎬';
    if (mimeType.startsWith('audio/')) return '🎵';
    if (mimeType.includes('zip') || mimeType.includes('archive')) return '📦';
    return '📎';
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-5rem)]">
        <div className="flex flex-col items-center gap-3">
          <Spinner className="size-8" />
          <p className="text-sm text-muted-foreground">Loading file tree...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-5rem)]">
      {/* Left Panel - File Tree */}
      <div className="w-1/2 border-r border-border flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <FolderTree className="size-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">File Explorer</h2>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => { setIsCreatingFolder(true); setNewFolderName(''); }}
              title="New folder"
            >
              <FolderPlus className="size-4" />
            </Button>
            {selectedNode?.type === 'folder' && (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    const folder = allFolders.find(f => f.id === selectedNode.id);
                    if (folder) {
                      setRenamingFolderId(folder.id);
                      setRenameFolderName(folder.name);
                    }
                  }}
                  title="Rename folder"
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleDeleteFolder(selectedNode.id)}
                  title="Delete folder"
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Inline new folder input */}
        <AnimatePresence>
          {isCreatingFolder && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-b border-border"
            >
              <div className="flex items-center gap-2 px-4 py-2">
                <FolderPlus className="size-4 text-blue-500 shrink-0" />
                <Input
                  ref={newFolderInputRef}
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateFolder();
                    if (e.key === 'Escape') setIsCreatingFolder(false);
                  }}
                  placeholder="Folder name..."
                  className="h-7 text-sm"
                />
                <Button size="sm" onClick={handleCreateFolder} className="h-7 text-xs shrink-0">
                  Create
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setIsCreatingFolder(false)} className="h-7 text-xs shrink-0">
                  Cancel
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Inline rename folder input */}
        <AnimatePresence>
          {renamingFolderId && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-b border-border"
            >
              <div className="flex items-center gap-2 px-4 py-2">
                <Pencil className="size-4 text-orange-500 shrink-0" />
                <Input
                  ref={renameFolderInputRef}
                  value={renameFolderName}
                  onChange={(e) => setRenameFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenameFolder();
                    if (e.key === 'Escape') setRenamingFolderId(null);
                  }}
                  placeholder="New name..."
                  className="h-7 text-sm"
                />
                <Button size="sm" onClick={handleRenameFolder} className="h-7 text-xs shrink-0">
                  Rename
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRenamingFolderId(null)} className="h-7 text-xs shrink-0">
                  Cancel
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tree */}
        <div
          className="flex-1 overflow-auto p-2"
          onDragOver={handleDragOver}
          onDrop={(e) => handleTreeDrop(e, selectedFolderId)}
        >
          {treeData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <FolderTree className="size-12 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No files yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Upload files or create folders to get started</p>
            </div>
          ) : (
            <ul className="space-y-0.5">
              {treeData.map((node) => (
                <FilesystemItem
                  key={node.id}
                  node={node}
                  animated
                  selected={selectedNode?.id || null}
                  onSelect={handleNodeSelect}
                  onDoubleClick={handleNodeDoubleClick}
                  onDragStartNode={handleTreeDragStart}
                  onDropOnFolder={handleTreeDropOnFolder}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Right Panel - Upload & Detail */}
      <div className="w-1/2 flex flex-col">
        {/* Context bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2 min-w-0">
            {selectedFolder ? (
              <>
                <ChevronRight className="size-3 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium text-foreground truncate">{selectedFolder.name}</span>
                <span className="text-xs text-muted-foreground">
                  ({filesInSelectedFolder.length} file{filesInSelectedFolder.length !== 1 ? 's' : ''})
                </span>
              </>
            ) : (
              <span className="text-sm font-medium text-muted-foreground">Root</span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setIsCreatingFolder(true); setNewFolderName(''); }}
              className="h-7 text-xs"
            >
              <FolderPlus className="size-3.5 mr-1" />
              New Folder
            </Button>
            <Button
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="h-7 text-xs"
            >
              <Upload className="size-3.5 mr-1" />
              {isUploading ? 'Uploading...' : 'Upload'}
            </Button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) handleUpload(e.target.files);
            e.target.value = '';
          }}
        />

        {/* Main content area */}
        <div className="flex-1 overflow-auto flex flex-col">
          {/* Drop zone */}
          <div
            className={`mx-4 mt-4 rounded-xl border-2 border-dashed transition-all ${
              isDragOver
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/40'
            } p-6 text-center cursor-pointer`}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDropOnUploadZone}
            onClick={() => fileInputRef.current?.click()}
          >
            <CloudUpload className={`size-8 mx-auto mb-2 ${isDragOver ? 'text-primary' : 'text-muted-foreground/40'}`} />
            <p className="text-sm font-medium text-foreground">
              {isUploading ? 'Uploading...' : 'Drop files here or click to upload'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Files will be encrypted and uploaded to {selectedFolder ? `"${selectedFolder.name}"` : 'root'}
            </p>
            {isUploading && <Spinner className="size-5 mx-auto mt-3" />}
          </div>

          {/* Files in selected context */}
          <div className="flex-1 px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Files {selectedFolder ? `in ${selectedFolder.name}` : 'in Root'}
            </p>
            {filesInSelectedFolder.length === 0 ? (
              <p className="text-sm text-muted-foreground/60 py-4 text-center">No files here</p>
            ) : (
              <div className="space-y-1">
                {filesInSelectedFolder.map((file) => (
                  <div
                    key={file.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, file.id)}
                    className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg border border-transparent transition-all cursor-pointer hover:bg-muted hover:border-border ${
                      selectedNode?.id === file.id ? 'bg-primary/5 border-primary/20' : ''
                    }`}
                    onClick={() => handleNodeSelect({ id: file.id, name: file.filename, type: 'file', mimeType: file.mimeType, size: file.size })}
                    onDoubleClick={() => setPreviewFile(file)}
                  >
                    <GripVertical className="size-3.5 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 cursor-grab" />
                    <span className="text-lg leading-none shrink-0">{getFileIcon(file.mimeType)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{file.filename}</p>
                      <p className="text-xs text-muted-foreground">{formatSize(file.size)}</p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="ghost" size="icon-sm" className="opacity-0 group-hover:opacity-100 shrink-0">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setPreviewFile(file)}>
                          <FileIcon className="size-4 mr-2" /> Preview
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDownloadFile(file)}>
                          <CloudUpload className="size-4 mr-2" /> Download
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => {
                          const targetId = selectedFolderId ? null : allFolders[0]?.id || null;
                          if (targetId !== file.folderId) handleMoveFile(file.id, targetId);
                        }}>
                          <FolderInput className="size-4 mr-2" /> Move
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDeleteFile(file.id)}
                          className="text-destructive focus:text-destructive focus:bg-destructive/10"
                        >
                          <Trash2 className="size-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* File Preview Dialog */}
      <FilePreviewDialog
        file={previewFile}
        isOpen={!!previewFile}
        onClose={() => setPreviewFile(null)}
        onDownload={handleDownloadFile}
      />
    </div>
  );
}
