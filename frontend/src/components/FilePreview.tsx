'use client';

/**
 * FilePreview Component - Preview decrypted files
 * 
 * Supports:
 * - Images (jpg, png, gif, webp, svg)
 * - Text files (txt, md, json, js, ts, py, etc.)
 * - PDF (embedded viewer)
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import {
  XMarkIcon,
  ArrowDownTrayIcon,
  DocumentIcon,
  PhotoIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import type { DecryptedFile, EncryptedBlobData } from '@/types';
import type { EncryptedBlob } from '@/lib/crypto/types';
import { decryptDownloadedFile } from '@/lib/crypto';
import * as api from '@/lib/api';

interface FilePreviewProps {
  file: DecryptedFile | null;
  isOpen: boolean;
  onClose: () => void;
  onDownload: (file: DecryptedFile) => void;
}

// File types we can preview
const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
const textTypes = [
  'text/plain',
  'text/markdown',
  'text/html',
  'text/css',
  'text/csv',
  'application/json',
  'application/javascript',
  'application/typescript',
  'application/xml',
];
const pdfTypes = ['application/pdf'];

// Check if file can be previewed based on mime type or extension
export function canPreview(mimeType: string, filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  
  if (imageTypes.includes(mimeType)) return true;
  if (textTypes.includes(mimeType)) return true;
  if (pdfTypes.includes(mimeType)) return true;
  
  // Check by extension for common text files
  const textExtensions = ['txt', 'md', 'json', 'js', 'ts', 'jsx', 'tsx', 'py', 'css', 'html', 'xml', 'yml', 'yaml', 'csv', 'log', 'env', 'sh'];
  if (textExtensions.includes(ext)) return true;
  
  return false;
}

function getPreviewType(mimeType: string, filename: string): 'image' | 'text' | 'pdf' | 'none' {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  
  if (imageTypes.includes(mimeType)) return 'image';
  if (textTypes.includes(mimeType)) return 'text';
  if (pdfTypes.includes(mimeType)) return 'pdf';
  
  // Check by extension for common text files
  const textExtensions = ['txt', 'md', 'json', 'js', 'ts', 'jsx', 'tsx', 'py', 'css', 'html', 'xml', 'yml', 'yaml', 'csv', 'log', 'env', 'sh'];
  if (textExtensions.includes(ext)) return 'text';
  
  return 'none';
}

/**
 * Convert backend blob format to crypto EncryptedBlob
 */
const toEncryptedBlob = (data: EncryptedBlobData): EncryptedBlob => ({
  ciphertext: data.ciphertext,
  algorithm: data.algorithm as 'xchacha20-poly1305',
  version: data.version,
});

export default function FilePreview({ file, isOpen, onClose, onDownload }: FilePreviewProps) {
  const { getVaultKey } = useAuth();
  const toast = useToast();
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
      // Download encrypted content
      const downloadResult = await api.downloadFile(file.id);
      if (!downloadResult.success || !downloadResult.data) {
        setError('Failed to download file');
        return;
      }

      // Decrypt file content
      const decryptResult = await decryptDownloadedFile(
        downloadResult.data,
        toEncryptedBlob(file.encryptedFileKey),
        vaultKey
      );

      if (!decryptResult.success || !decryptResult.data) {
        setError('Failed to decrypt file');
        return;
      }

      // Convert to appropriate format for preview
      if (previewType === 'image' || previewType === 'pdf') {
        // Create blob URL for image/PDF - convert Uint8Array to ArrayBuffer
        const arrayBuffer = new ArrayBuffer(decryptResult.data.length);
        new Uint8Array(arrayBuffer).set(decryptResult.data);
        const blob = new Blob([arrayBuffer], { type: file.mimeType });
        const url = URL.createObjectURL(blob);
        setPreviewContent(url);
      } else if (previewType === 'text') {
        // Decode as text
        const decoder = new TextDecoder('utf-8');
        const text = decoder.decode(decryptResult.data);
        // Limit preview size for very large files
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

  // Load preview when dialog opens
  useEffect(() => {
    if (isOpen && file) {
      loadPreview();
    }
    
    // Cleanup blob URL when closing
    return () => {
      if (previewContent?.startsWith('blob:')) {
        URL.revokeObjectURL(previewContent);
      }
    };
  }, [isOpen, file, loadPreview]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setPreviewContent(null);
      setError(null);
    }
  }, [isOpen]);

  if (!file) return null;

  const previewType = getPreviewType(file.mimeType, file.filename);

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-4xl transform overflow-hidden rounded-2xl bg-white dark:bg-slate-800 shadow-2xl transition-all">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-3">
                    {previewType === 'image' && <PhotoIcon className="w-5 h-5 text-pink-500" />}
                    {previewType === 'text' && <DocumentTextIcon className="w-5 h-5 text-blue-500" />}
                    {previewType === 'pdf' && <DocumentIcon className="w-5 h-5 text-red-500" />}
                    <Dialog.Title className="text-lg font-medium text-slate-900 dark:text-white truncate max-w-[400px]">
                      {file.filename}
                    </Dialog.Title>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDownload(file)}
                      className="text-slate-600 dark:text-slate-300"
                    >
                      <ArrowDownTrayIcon className="w-4 h-4 mr-1" />
                      Download
                    </Button>
                    <button
                      onClick={onClose}
                      className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                      <XMarkIcon className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="min-h-[400px] max-h-[70vh] overflow-auto">
                  {isLoading ? (
                    <div className="flex flex-col items-center justify-center h-[400px]">
                      <Spinner className="w-8 h-8 text-indigo-600" />
                      <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
                        Decrypting file...
                      </p>
                    </div>
                  ) : error ? (
                    <div className="flex flex-col items-center justify-center h-[400px] text-center p-6">
                      <DocumentIcon className="w-16 h-16 text-slate-400 mb-4" />
                      <p className="text-slate-600 dark:text-slate-400">{error}</p>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => onDownload(file)}
                        className="mt-4"
                      >
                        <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
                        Download Instead
                      </Button>
                    </div>
                  ) : previewContent ? (
                    <>
                      {previewType === 'image' && (
                        <div className="flex items-center justify-center p-6 bg-slate-100 dark:bg-slate-900">
                          <img
                            src={previewContent}
                            alt={file.filename}
                            className="max-w-full max-h-[60vh] object-contain rounded-lg"
                          />
                        </div>
                      )}
                      {previewType === 'text' && (
                        <pre className="p-6 text-sm font-mono text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words bg-slate-50 dark:bg-slate-900">
                          {previewContent}
                        </pre>
                      )}
                      {previewType === 'pdf' && (
                        <iframe
                          src={previewContent}
                          className="w-full h-[70vh]"
                          title={file.filename}
                        />
                      )}
                    </>
                  ) : null}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
