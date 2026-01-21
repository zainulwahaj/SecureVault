'use client';

/**
 * ShareFileDialog - Envelope Encryption File Sharing UI
 * 
 * SECURITY:
 * 1. Search for users by email
 * 2. Get recipient's public key
 * 3. Decrypt FileKey with VaultKey
 * 4. Re-encrypt FileKey with recipient's public key
 * 5. Send encrypted blob to backend
 * 
 * Backend never sees the FileKey in plaintext.
 */

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import type { UserPublicInfo, DecryptedFile, EncryptedBlobData } from '@/types';
import type { EncryptedBlob } from '@/lib/crypto/types';
import * as api from '@/lib/api';
import { decryptFileKey } from '@/lib/crypto';
import { encryptFileKeyForRecipient } from '@/lib/crypto/keypair';

interface ShareFileDialogProps {
  file: DecryptedFile;
  isOpen: boolean;
  onClose: () => void;
}

export default function ShareFileDialog({ file, isOpen, onClose }: ShareFileDialogProps) {
  const { getVaultKey } = useAuth();
  const toast = useToast();
  const { confirmRemoveShare } = useConfirm();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserPublicInfo[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingShares, setExistingShares] = useState<{ recipientId: string; recipientEmail: string }[]>([]);

  // Load existing shares for this file
  useEffect(() => {
    if (isOpen) {
      loadExistingShares();
    }
  }, [isOpen, file.id]);

  const loadExistingShares = async () => {
    const response = await api.getFileShares(file.id);
    if (response.success && response.data) {
      setExistingShares(response.data.shares || []);
    }
  };

  /**
   * Convert backend blob format to crypto EncryptedBlob
   */
  const toEncryptedBlob = (data: EncryptedBlobData): EncryptedBlob => ({
    ciphertext: data.ciphertext,
    algorithm: data.algorithm as 'xchacha20-poly1305',
    version: data.version,
  });

  /**
   * Search for users by email
   */
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() || searchQuery.length < 3) return;

    setIsSearching(true);
    setError(null);

    try {
      const response = await api.searchUsers(searchQuery);
      if (response.success && response.data) {
        // Filter out users who already have access
        const existingIds = existingShares.map(s => s.recipientId);
        const filtered = response.data.filter(u => !existingIds.includes(u.id));
        setSearchResults(filtered);
      } else {
        setError(response.error || 'Search failed');
      }
    } catch (err) {
      setError('Search failed');
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, existingShares]);

  /**
   * Share file with a user using envelope encryption
   */
  const handleShare = useCallback(async (recipient: UserPublicInfo) => {
    const vaultKey = getVaultKey();
    if (!vaultKey) {
      toast.error('Not authenticated');
      return;
    }

    setIsSharing(true);
    setError(null);

    try {
      // Step 1: Decrypt the FileKey using VaultKey
      const fileKeyResult = await decryptFileKey(
        toEncryptedBlob(file.encryptedFileKey),
        vaultKey
      );
      
      if (!fileKeyResult.success || !fileKeyResult.data) {
        toast.error('Failed to decrypt file key');
        return;
      }
      
      const fileKey = fileKeyResult.data;

      // Step 2: Re-encrypt FileKey with recipient's public key
      const encryptedForRecipient = await encryptFileKeyForRecipient(
        fileKey,
        recipient.publicKey
      );

      // Step 3: Clear FileKey from memory
      fileKey.fill(0);

      // Step 4: Send to backend (format as EncryptedBlob)
      const response = await api.shareFile(
        file.id,
        recipient.id,
        {
          ciphertext: encryptedForRecipient,
          algorithm: 'x25519-xsalsa20-poly1305',
          version: 1,
        }
      );

      if (response.success) {
        toast.success(`Shared with ${recipient.email}`);
        setSearchResults(prev => prev.filter(u => u.id !== recipient.id));
        setExistingShares(prev => [...prev, { 
          recipientId: recipient.id, 
          recipientEmail: recipient.email 
        }]);
      } else {
        toast.error('Failed to share', response.error);
      }
    } catch {
      toast.error('Failed to share file');
    } finally {
      setIsSharing(false);
    }
  }, [file, getVaultKey, toast]);

  /**
   * Remove sharing access
   */
  const handleUnshare = useCallback(async (recipientId: string, recipientEmail: string) => {
    const confirmed = await confirmRemoveShare(recipientEmail, file.filename);
    if (!confirmed) return;
    
    try {
      const response = await api.unshareFile(file.id, recipientId);
      if (response.success) {
        setExistingShares(prev => prev.filter(s => s.recipientId !== recipientId));
        toast.success('Access removed');
      } else {
        toast.error('Failed to remove access', response.error);
      }
    } catch {
      toast.error('Failed to remove access');
    }
  }, [file.id, file.filename, confirmRemoveShare, toast]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden border border-slate-200 dark:border-slate-700">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Share "{file.filename}"
          </h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {/* Error message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Search input */}
          <div className="flex gap-2 mb-4">
            <input
              type="email"
              placeholder="Search by email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            <button
              onClick={handleSearch}
              disabled={isSearching || searchQuery.length < 3}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {isSearching ? '...' : 'Search'}
            </button>
          </div>

          {/* Search results */}
          {searchResults.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Add people:</h4>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {searchResults.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-2 bg-slate-100 dark:bg-slate-700 rounded-lg"
                  >
                    <span className="text-sm text-slate-900 dark:text-white">{user.email}</span>
                    <button
                      onClick={() => handleShare(user)}
                      disabled={isSharing}
                      className="px-3 py-1 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50 transition-colors"
                    >
                      {isSharing ? '...' : 'Share'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Existing shares */}
          {existingShares.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Shared with:</h4>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {existingShares.map((share) => (
                  <div
                    key={share.recipientId}
                    className="flex items-center justify-between p-2 bg-green-100 dark:bg-green-900/30 rounded-lg"
                  >
                    <span className="text-sm text-slate-900 dark:text-white">{share.recipientEmail}</span>
                    <button
                      onClick={() => handleUnshare(share.recipientId, share.recipientEmail)}
                      className="px-3 py-1 text-sm text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {searchResults.length === 0 && existingShares.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">
              Search for users by email to share this file
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
