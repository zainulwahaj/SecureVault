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
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Separator } from '@/components/ui/separator';
import {
  Download,
  ImageIcon,
  FileText,
  FileIcon,
  Film,
  Music,
  Archive,
  Presentation,
  Sheet,
  X,
  Maximize2,
  Minimize2,
  ExternalLink,
} from 'lucide-react';

interface FilePreviewDialogProps {
  file: DecryptedFile | null;
  isOpen: boolean;
  onClose: () => void;
  onDownload: (file: DecryptedFile) => void;
}

const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp'];
const textTypes = [
  'text/plain', 'text/markdown', 'text/html', 'text/css', 'text/csv',
  'application/json', 'application/javascript', 'application/typescript', 'application/xml',
];
const pdfTypes = ['application/pdf'];
const videoTypes = ['video/mp4', 'video/webm', 'video/ogg'];
const audioTypes = ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/mp3'];

type PreviewType = 'image' | 'text' | 'pdf' | 'video' | 'audio' | 'none';

function getPreviewType(mimeType: string, filename: string): PreviewType {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (imageTypes.includes(mimeType)) return 'image';
  if (textTypes.includes(mimeType)) return 'text';
  if (pdfTypes.includes(mimeType)) return 'pdf';
  if (videoTypes.includes(mimeType)) return 'video';
  if (audioTypes.includes(mimeType)) return 'audio';
  const textExts = ['txt', 'md', 'json', 'js', 'ts', 'jsx', 'tsx', 'py', 'css', 'html', 'xml', 'yml', 'yaml', 'csv', 'log', 'env', 'sh', 'toml', 'ini', 'cfg', 'conf'];
  if (textExts.includes(ext)) return 'text';
  return 'none';
}

function getFileTypeInfo(mimeType: string, filename: string) {
  const type = getPreviewType(mimeType, filename);
  switch (type) {
    case 'image': return { icon: ImageIcon, color: 'text-pink-500', bg: 'bg-pink-500/10', label: 'Image' };
    case 'text': return { icon: FileText, color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'Document' };
    case 'pdf': return { icon: FileIcon, color: 'text-red-500', bg: 'bg-red-500/10', label: 'PDF' };
    case 'video': return { icon: Film, color: 'text-purple-500', bg: 'bg-purple-500/10', label: 'Video' };
    case 'audio': return { icon: Music, color: 'text-emerald-500', bg: 'bg-emerald-500/10', label: 'Audio' };
    default: return { icon: FileIcon, color: 'text-muted-foreground', bg: 'bg-muted', label: 'File' };
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const toEncryptedBlob = (data: EncryptedBlobData): EncryptedBlob => ({
  ciphertext: data.ciphertext,
  algorithm: data.algorithm as 'xchacha20-poly1305',
  version: data.version,
});

export default function FilePreviewDialog({ file, isOpen, onClose, onDownload }: FilePreviewDialogProps) {
  const { getVaultKey } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    if (!file) return;
    const vaultKey = getVaultKey();
    if (!vaultKey) { setError('Not authenticated'); return; }

    const previewType = getPreviewType(file.mimeType, file.filename);
    if (previewType === 'none') { setError('Preview not available for this file type'); return; }

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
        vaultKey,
      );

      if (!decryptResult.success || !decryptResult.data) {
        setError('Failed to decrypt file');
        return;
      }

      if (previewType === 'text') {
        const decoder = new TextDecoder('utf-8');
        let text = decoder.decode(decryptResult.data);
        if (text.length > 100000) text = text.substring(0, 100000) + '\n\n... (truncated)';
        setTextContent(text);
      } else {
        const blob = new Blob([decryptResult.data], { type: file.mimeType });
        setPreviewUrl(URL.createObjectURL(blob));
      }
    } catch {
      setError('Failed to load preview');
    } finally {
      setIsLoading(false);
    }
  }, [file, getVaultKey]);

  useEffect(() => {
    if (isOpen && file) loadPreview();
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [isOpen, file, loadPreview]);

  useEffect(() => {
    if (!isOpen) {
      setPreviewUrl(null);
      setTextContent(null);
      setError(null);
    }
  }, [isOpen]);

  if (!file) return null;

  const previewType = getPreviewType(file.mimeType, file.filename);
  const typeInfo = getFileTypeInfo(file.mimeType, file.filename);
  const TypeIcon = typeInfo.icon;

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl w-[90vw] p-0 gap-0 overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`flex items-center justify-center size-9 rounded-lg ${typeInfo.bg}`}>
              <TypeIcon className={`size-4.5 ${typeInfo.color}`} />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-sm font-semibold truncate max-w-[300px] sm:max-w-[450px]">
                {file.filename}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {typeInfo.label} &middot; {formatSize(file.size)}
              </DialogDescription>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => onDownload(file)} className="shrink-0">
            <Download className="size-3.5 mr-1.5" />
            Download
          </Button>
        </div>

        <div className="min-h-[350px] max-h-[70vh] overflow-auto bg-muted/20">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-[350px]">
              <Spinner className="size-8" />
              <p className="mt-4 text-sm text-muted-foreground">Decrypting file...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-[350px] text-center p-8">
              <div className={`size-16 rounded-2xl ${typeInfo.bg} flex items-center justify-center mb-4`}>
                <TypeIcon className={`size-8 ${typeInfo.color}`} />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">{file.filename}</p>
              <p className="text-sm text-muted-foreground mb-4">{error}</p>
              <Button variant="outline" size="sm" onClick={() => onDownload(file)}>
                <Download className="size-4 mr-2" />
                Download Instead
              </Button>
            </div>
          ) : (
            <>
              {previewType === 'image' && previewUrl && (
                <div className="flex items-center justify-center p-6 min-h-[350px]">
                  <img
                    src={previewUrl}
                    alt={file.filename}
                    className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-lg"
                  />
                </div>
              )}

              {previewType === 'text' && textContent !== null && (
                <div className="relative">
                  <pre className="p-6 text-sm font-mono text-foreground whitespace-pre-wrap break-words leading-relaxed">
                    {textContent}
                  </pre>
                </div>
              )}

              {previewType === 'pdf' && previewUrl && (
                <iframe
                  src={previewUrl}
                  className="w-full h-[70vh]"
                  title={file.filename}
                />
              )}

              {previewType === 'video' && previewUrl && (
                <div className="flex items-center justify-center p-6">
                  <video
                    src={previewUrl}
                    controls
                    className="max-w-full max-h-[60vh] rounded-lg shadow-lg"
                  />
                </div>
              )}

              {previewType === 'audio' && previewUrl && (
                <div className="flex flex-col items-center justify-center p-12 min-h-[350px]">
                  <div className={`size-24 rounded-3xl ${typeInfo.bg} flex items-center justify-center mb-6`}>
                    <Music className={`size-10 ${typeInfo.color}`} />
                  </div>
                  <p className="text-sm font-medium text-foreground mb-4">{file.filename}</p>
                  <audio src={previewUrl} controls className="w-full max-w-md" />
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
