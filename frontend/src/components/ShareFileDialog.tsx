'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { toast } from 'sonner';
import type { UserPublicInfo, DecryptedFile, EncryptedBlobData } from '@/types';
import type { EncryptedBlob } from '@/lib/crypto/types';
import * as api from '@/lib/api';
import { decryptFileKey } from '@/lib/crypto';
import { encryptFileKeyForRecipient } from '@/lib/crypto/keypair';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { AlertCircle, Search, UserPlus, X as XIcon } from 'lucide-react';

interface ShareFileDialogProps {
  file: DecryptedFile;
  isOpen: boolean;
  onClose: () => void;
}

export default function ShareFileDialog({ file, isOpen, onClose }: ShareFileDialogProps) {
  const { getVaultKey } = useAuth();
  const { confirm } = useConfirm();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserPublicInfo[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingShares, setExistingShares] = useState<{ recipientId: string; recipientEmail: string }[]>([]);

  useEffect(() => {
    if (isOpen) loadExistingShares();
  }, [isOpen, file.id]);

  const loadExistingShares = async () => {
    const response = await api.getFileShares(file.id);
    if (response.success && response.data) {
      setExistingShares(response.data.shares || []);
    }
  };

  const toEncryptedBlob = (data: EncryptedBlobData): EncryptedBlob => ({
    ciphertext: data.ciphertext,
    algorithm: data.algorithm as 'xchacha20-poly1305',
    version: data.version,
  });

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() || searchQuery.length < 3) return;

    setIsSearching(true);
    setError(null);

    try {
      const response = await api.searchUsers(searchQuery);
      if (response.success && response.data) {
        const existingIds = existingShares.map(s => s.recipientId);
        const filtered = response.data.filter(u => !existingIds.includes(u.id));
        setSearchResults(filtered);
      } else {
        setError(response.error || 'Search failed');
      }
    } catch {
      setError('Search failed');
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, existingShares]);

  const handleShare = useCallback(async (recipient: UserPublicInfo) => {
    const vaultKey = getVaultKey();
    if (!vaultKey) {
      toast.error('Not authenticated');
      return;
    }

    setIsSharing(true);
    setError(null);

    try {
      const fileKeyResult = await decryptFileKey(toEncryptedBlob(file.encryptedFileKey), vaultKey);
      if (!fileKeyResult.success || !fileKeyResult.data) {
        toast.error('Failed to decrypt file key');
        return;
      }

      const fileKey = fileKeyResult.data;
      const encryptedForRecipient = await encryptFileKeyForRecipient(fileKey, recipient.publicKey);
      fileKey.fill(0);

      const response = await api.shareFile(
        file.id,
        recipient.id,
        { ciphertext: encryptedForRecipient, algorithm: 'x25519-xsalsa20-poly1305', version: 1 }
      );

      if (response.success) {
        toast.success(`Shared with ${recipient.email}`);
        setSearchResults(prev => prev.filter(u => u.id !== recipient.id));
        setExistingShares(prev => [...prev, { recipientId: recipient.id, recipientEmail: recipient.email }]);
      } else {
        toast.error('Failed to share', { description: response.error });
      }
    } catch {
      toast.error('Failed to share file');
    } finally {
      setIsSharing(false);
    }
  }, [file, getVaultKey]);

  const handleUnshare = useCallback(async (recipientId: string, recipientEmail: string) => {
    const confirmed = await confirm({
      title: 'Remove Access',
      message: `Remove ${recipientEmail}'s access to "${file.filename}"?`,
      confirmLabel: 'Remove',
      variant: 'destructive',
    });
    if (!confirmed) return;

    try {
      const response = await api.unshareFile(file.id, recipientId);
      if (response.success) {
        setExistingShares(prev => prev.filter(s => s.recipientId !== recipientId));
        toast.success('Access removed');
      } else {
        toast.error('Failed to remove access', { description: response.error });
      }
    } catch {
      toast.error('Failed to remove access');
    }
  }, [file.id, file.filename, confirm]);

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share &ldquo;{file.filename}&rdquo;</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Search */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                type="email"
                placeholder="Search by email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-9"
              />
            </div>
            <Button onClick={handleSearch} disabled={isSearching || searchQuery.length < 3}>
              {isSearching ? <Spinner className="size-4" /> : 'Search'}
            </Button>
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-foreground mb-2">Add people:</h4>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {searchResults.map((user) => (
                  <div key={user.id} className="flex items-center justify-between p-2.5 bg-muted rounded-lg">
                    <span className="text-sm text-foreground">{user.email}</span>
                    <Button size="sm" onClick={() => handleShare(user)} disabled={isSharing}>
                      {isSharing ? <Spinner className="size-3" /> : <><UserPlus className="size-3.5 mr-1" /> Share</>}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Existing Shares */}
          {existingShares.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-foreground mb-2">Shared with:</h4>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {existingShares.map((share) => (
                  <div key={share.recipientId} className="flex items-center justify-between p-2.5 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <span className="text-sm text-foreground">{share.recipientEmail}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleUnshare(share.recipientId, share.recipientEmail)}
                      className="text-destructive hover:bg-destructive/10"
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {searchResults.length === 0 && existingShares.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Search for users by email to share this file
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
