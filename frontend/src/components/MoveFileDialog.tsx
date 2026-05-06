'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import type { DecryptedFile, DecryptedFolder, EncryptedBlobData } from '@/types';
import type { EncryptedBlob } from '@/lib/crypto/types';
import { decryptMetadata } from '@/lib/crypto';
import * as api from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { FilesystemItem, type FileNode } from '@/components/ui/filesystem-item';
import { Folder, Home } from 'lucide-react';

interface MoveFileDialogProps {
  files: DecryptedFile[];
  isOpen: boolean;
  onClose: () => void;
  onMoved: () => void;
}

const toEncryptedBlob = (data: EncryptedBlobData): EncryptedBlob => ({
  ciphertext: data.ciphertext,
  algorithm: data.algorithm as 'xchacha20-poly1305',
  version: data.version,
});

export default function MoveFileDialog({ files, isOpen, onClose, onMoved }: MoveFileDialogProps) {
  const { getVaultKey } = useAuth();
  const [folderTree, setFolderTree] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  const loadFolderTree = useCallback(async () => {
    const vaultKey = getVaultKey();
    if (!vaultKey) return;

    setLoading(true);
    try {
      const response = await api.listFolders();
      if (!response.success || !response.data) return;

      const decryptedFolders: DecryptedFolder[] = [];
      for (const folder of response.data.folders) {
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

      const buildTree = (parentId: string | null): FileNode[] => {
        return decryptedFolders
          .filter(f => f.parentId === parentId)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(f => ({
            id: f.id,
            name: f.name,
            type: 'folder' as const,
            nodes: buildTree(f.id),
          }));
      };

      setFolderTree(buildTree(null));
    } catch {
      toast.error('Failed to load folders');
    } finally {
      setLoading(false);
    }
  }, [getVaultKey]);

  useEffect(() => {
    if (isOpen) {
      setSelectedFolderId(null);
      loadFolderTree();
    }
  }, [isOpen, loadFolderTree]);

  const handleMove = useCallback(async () => {
    setMoving(true);
    let successCount = 0;

    try {
      for (const file of files) {
        const result = await api.moveFile(file.id, selectedFolderId);
        if (result.success) successCount++;
      }

      if (successCount > 0) {
        toast.success(
          `Moved ${successCount} file${successCount > 1 ? 's' : ''}`,
          { description: selectedFolderId ? 'Files moved to folder' : 'Files moved to root' }
        );
        onMoved();
        onClose();
      }
    } catch {
      toast.error('Failed to move files');
    } finally {
      setMoving(false);
    }
  }, [files, selectedFolderId, onMoved, onClose]);

  const fileNames = files.map(f => f.filename).join(', ');

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move {files.length > 1 ? `${files.length} files` : 'file'}</DialogTitle>
          <DialogDescription className="truncate">
            {files.length === 1 ? fileNames : `${files.length} selected files`}
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 max-h-72 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner className="size-5" />
            </div>
          ) : (
            <ul className="space-y-0.5">
              <li>
                <div
                  className={`flex items-center gap-2 py-2 px-2 rounded-lg cursor-pointer transition-colors ${
                    selectedFolderId === null
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-muted text-foreground'
                  }`}
                  onClick={() => setSelectedFolderId(null)}
                >
                  <Home className="size-4" />
                  <span className="text-sm font-medium">Root</span>
                </div>
              </li>
              {folderTree.map((node) => (
                <FilesystemItem
                  key={node.id}
                  node={node}
                  animated
                  selected={selectedFolderId}
                  onSelect={(n) => setSelectedFolderId(n.id)}
                />
              ))}
              {folderTree.length === 0 && (
                <li className="py-6 text-center text-sm text-muted-foreground">
                  No folders yet
                </li>
              )}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={moving}>
            Cancel
          </Button>
          <Button onClick={handleMove} disabled={moving}>
            {moving ? <Spinner className="size-4 mr-2" /> : <Folder className="size-4 mr-2" />}
            Move here
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
