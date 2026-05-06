'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import type { DecryptedFile, EncryptedBlobData } from '@/types';
import type { EncryptedBlob } from '@/lib/crypto/types';
import { decryptDownloadedFile } from '@/lib/crypto';
import * as api from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { X, Download, ImageIcon, FileText, FileIcon } from 'lucide-react';

interface FilePreviewProps {
  file: DecryptedFile | null;
  isOpen: boolean;
  onClose: () => void;
  onDownload: (file: DecryptedFile) => void;
}

const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
const textTypes = [
  'text/plain', 'text/markdown', 'text/html', 'text/css', 'text/csv',
  'application/json', 'application/javascript', 'application/typescript', 'application/xml',
];
const pdfTypes = ['application/pdf'];

export function canPreview(mimeType: string, filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (imageTypes.includes(mimeType)) return true;
  if (textTypes.includes(mimeType)) return true;
  if (pdfTypes.includes(mimeType)) return true;
  const textExtensions = ['txt', 'md', 'json', 'js', 'ts', 'jsx', 'tsx', 'py', 'css', 'html', 'xml', 'yml', 'yaml', 'csv', 'log', 'env', 'sh'];
  if (textExtensions.includes(ext)) return true;
  return false;
}

function getPreviewType(mimeType: string, filename: string): 'image' | 'text' | 'pdf' | 'none' {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (imageTypes.includes(mimeType)) return 'image';
  if (textTypes.includes(mimeType)) return 'text';
  if (pdfTypes.includes(mimeType)) return 'pdf';
  const textExtensions = ['txt', 'md', 'json', 'js', 'ts', 'jsx', 'tsx', 'py', 'css', 'html', 'xml', 'yml', 'yaml', 'csv', 'log', 'env', 'sh'];
  if (textExtensions.includes(ext)) return 'text';
  return 'none';
}

const toEncryptedBlob = (data: EncryptedBlobData): EncryptedBlob => ({
  ciphertext: data.ciphertext,
  algorithm: data.algorithm as 'xchacha20-poly1305',
  version: data.version,
});

export default function FilePreview({ file, isOpen, onClose, onDownload }: FilePreviewProps) {
  const { getVaultKey } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    if (!file) return;

    const vaultKey = getVaultKey();
    if (!vaultKey) {
      setError('Not authenticated');
      return;
    }

    const previewType = getPreviewType(file.mimeType, file.filename);
    if (previewType === 'none') {
      setError('This file type cannot be previewed');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const downloadResult = await api.downloadFile(file.id);
      if (!downloadResult.success || !downloadResult.data) {
        setError('Failed to download file');
        return;
      }

      const decryptResult = await decryptDownloadedFile(
        downloadResult.data,
        toEncryptedBlob(file.encryptedFileKey),
        vaultKey
      );

      if (!decryptResult.success || !decryptResult.data) {
        setError('Failed to decrypt file');
        return;
      }

      if (previewType === 'image' || previewType === 'pdf') {
        const arrayBuffer = new ArrayBuffer(decryptResult.data.length);
        new Uint8Array(arrayBuffer).set(decryptResult.data);
        const blob = new Blob([arrayBuffer], { type: file.mimeType });
        const url = URL.createObjectURL(blob);
        setPreviewContent(url);
      } else if (previewType === 'text') {
        const decoder = new TextDecoder('utf-8');
        const text = decoder.decode(decryptResult.data);
        if (text.length > 100000) {
          setPreviewContent(text.substring(0, 100000) + '\n\n... (truncated, file too large to preview)');
        } else {
          setPreviewContent(text);
        }
      }
    } catch {
      setError('Failed to load preview');
    } finally {
      setIsLoading(false);
    }
  }, [file, getVaultKey]);

  useEffect(() => {
    if (isOpen && file) {
      loadPreview();
    }
    return () => {
      if (previewContent?.startsWith('blob:')) {
        URL.revokeObjectURL(previewContent);
      }
    };
  }, [isOpen, file, loadPreview]);

  useEffect(() => {
    if (!isOpen) {
      setPreviewContent(null);
      setError(null);
    }
  }, [isOpen]);

  if (!file) return null;

  const previewType = getPreviewType(file.mimeType, file.filename);

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              {previewType === 'image' && <ImageIcon className="size-5 text-pink-500 flex-shrink-0" />}
              {previewType === 'text' && <FileText className="size-5 text-blue-500 flex-shrink-0" />}
              {previewType === 'pdf' && <FileIcon className="size-5 text-red-500 flex-shrink-0" />}
              <DialogTitle className="truncate max-w-[400px]">{file.filename}</DialogTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDownload(file)}
            >
              <Download className="size-4 mr-1" />
              Download
            </Button>
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="min-h-[400px] max-h-[70vh] overflow-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-[400px]">
              <Spinner className="size-8" />
              <p className="mt-4 text-sm text-muted-foreground">Decrypting file...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-[400px] text-center p-6">
              <FileIcon className="size-16 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">{error}</p>
              <Button size="sm" onClick={() => onDownload(file)} className="mt-4">
                <Download className="size-4 mr-2" />
                Download Instead
              </Button>
            </div>
          ) : previewContent ? (
            <>
              {previewType === 'image' && (
                <div className="flex items-center justify-center p-6 bg-muted">
                  <img src={previewContent} alt={file.filename} className="max-w-full max-h-[60vh] object-contain rounded-lg" />
                </div>
              )}
              {previewType === 'text' && (
                <pre className="p-6 text-sm font-mono text-foreground whitespace-pre-wrap break-words bg-muted/50">
                  {previewContent}
                </pre>
              )}
              {previewType === 'pdf' && (
                <iframe src={previewContent} className="w-full h-[70vh]" title={file.filename} />
              )}
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
