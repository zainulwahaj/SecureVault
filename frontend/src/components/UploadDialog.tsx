'use client';

import { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  CloudUpload,
  FileIcon,
  X,
  Lock,
  ImageIcon,
  VideoIcon,
  Music,
  FileText,
  Archive,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface UploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpload: (files: FileList) => Promise<void>;
  isUploading: boolean;
  uploadProgress: string | null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getFileIcon(file: File) {
  const type = file.type;
  const cls = 'size-5';
  if (type.startsWith('image/')) return <ImageIcon className={`${cls} text-pink-500`} />;
  if (type.startsWith('video/')) return <VideoIcon className={`${cls} text-purple-500`} />;
  if (type.startsWith('audio/')) return <Music className={`${cls} text-green-500`} />;
  if (type.includes('pdf')) return <FileText className={`${cls} text-red-500`} />;
  if (type.includes('document') || type.includes('word')) return <FileText className={`${cls} text-blue-500`} />;
  if (type.includes('spreadsheet') || type.includes('excel')) return <FileText className={`${cls} text-emerald-500`} />;
  if (type.includes('zip') || type.includes('archive')) return <Archive className={`${cls} text-amber-500`} />;
  return <FileIcon className={`${cls} text-muted-foreground`} />;
}

export default function UploadDialog({
  open,
  onOpenChange,
  onUpload,
  isUploading,
  uploadProgress,
}: UploadDialogProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      setSelectedFiles(Array.from(e.dataTransfer.files));
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFiles(Array.from(e.target.files));
    }
  }, []);

  const removeFile = useCallback((index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleUpload = useCallback(async () => {
    if (selectedFiles.length === 0) return;

    const dt = new DataTransfer();
    selectedFiles.forEach(f => dt.items.add(f));
    await onUpload(dt.files);
    setSelectedFiles([]);
    onOpenChange(false);
  }, [selectedFiles, onUpload, onOpenChange]);

  const handleClose = useCallback(() => {
    if (!isUploading) {
      setSelectedFiles([]);
      onOpenChange(false);
    }
  }, [isUploading, onOpenChange]);

  const totalSize = selectedFiles.reduce((acc, f) => acc + f.size, 0);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload file</DialogTitle>
          <DialogDescription className="sr-only">
            Drag and drop files or choose files to upload
          </DialogDescription>
        </DialogHeader>

        <div
          className={`relative rounded-xl border-2 border-dashed p-8 text-center transition-all cursor-pointer
            ${isDragOver
              ? 'border-primary bg-primary/5'
              : selectedFiles.length > 0
                ? 'border-primary/30 bg-primary/5'
                : 'border-border hover:border-muted-foreground/30 hover:bg-muted/30'
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
            onChange={handleFileSelect}
            disabled={isUploading}
          />

          <div className="flex flex-col items-center gap-2">
            <div className={`size-12 rounded-xl flex items-center justify-center transition-colors ${isDragOver ? 'bg-primary/10' : 'bg-muted'}`}>
              <CloudUpload className={`size-6 ${isDragOver ? 'text-primary' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <p className="text-sm text-foreground">
                Drag and Drop file here or{' '}
                <span className="font-semibold text-primary underline underline-offset-2">Choose file</span>
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Lock className="size-3" />
            Encrypted before upload
          </span>
          <span>Maximum size: 100MB</span>
        </div>

        <AnimatePresence>
          {selectedFiles.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-2 overflow-hidden"
            >
              <div className="max-h-48 overflow-y-auto space-y-1.5">
                {selectedFiles.map((file, index) => (
                  <motion.div
                    key={`${file.name}-${index}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="flex items-center gap-3 rounded-lg border border-border bg-card p-2.5"
                  >
                    <div className="size-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      {getFileIcon(file)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                    </div>
                    {!isUploading && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={(e) => { e.stopPropagation(); removeFile(index); }}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                      >
                        <X className="size-3.5" />
                      </Button>
                    )}
                  </motion.div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground text-right">
                {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} · {formatFileSize(totalSize)}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {isUploading && uploadProgress && (
          <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <Spinner className="size-4 shrink-0" />
            <span className="text-sm text-foreground font-medium truncate">{uploadProgress}</span>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isUploading}>
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={isUploading || selectedFiles.length === 0}
          >
            {isUploading ? (
              <>
                <Spinner className="size-4 mr-1.5" />
                Uploading...
              </>
            ) : (
              <>Upload {selectedFiles.length > 0 ? `(${selectedFiles.length})` : ''}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
