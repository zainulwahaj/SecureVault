'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import * as api from '@/lib/api';
import type { AuditLogEntry, DecryptedFile } from '@/types';
import {
  decryptFileMetadata,
} from '@/lib/crypto';
import type { EncryptedBlob } from '@/lib/crypto/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Bar, BarChart, XAxis, YAxis } from 'recharts';
import {
  FileIcon,
  HardDrive,
  ShieldCheck,
  Share2,
  TrendingUp,
  ArrowRight,
  Folder,
  Upload,
  Download,
  Trash2,
  LogIn,
  Key,
  Clock,
  FolderIcon,
  Lock,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { PageHeader, MonoChip, PageShell } from '@/components/cipher-lab';

interface DashboardOverviewProps {
  onNavigate: (view: string) => void;
  storageUsed: number;
  fileCount: number;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

const ACTION_CONFIG: Record<string, { label: string; icon: typeof FileIcon; color: string; bg: string }> = {
  'file.upload': { label: 'File uploaded', icon: Upload, color: 'text-primary', bg: 'bg-primary/10' },
  'file.download': { label: 'File downloaded', icon: Download, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  'file.delete': { label: 'File deleted', icon: Trash2, color: 'text-destructive', bg: 'bg-destructive/10' },
  'file.restore': { label: 'File restored', icon: FileIcon, color: 'text-green-500', bg: 'bg-green-500/10' },
  'folder.create': { label: 'Folder created', icon: FolderIcon, color: 'text-primary', bg: 'bg-primary/10' },
  'share.create': { label: 'File shared', icon: Share2, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  'auth.login': { label: 'Logged in', icon: LogIn, color: 'text-green-500', bg: 'bg-green-500/10' },
  'mfa.enable': { label: 'MFA enabled', icon: ShieldCheck, color: 'text-green-500', bg: 'bg-green-500/10' },
};

const storageChartConfig: ChartConfig = {
  images: { label: 'Images', color: 'oklch(0.623 0.214 259.815)' },
  documents: { label: 'Documents', color: 'oklch(0.546 0.245 262.881)' },
  videos: { label: 'Videos', color: 'oklch(0.488 0.243 264.376)' },
  audio: { label: 'Audio', color: 'oklch(0.424 0.199 265.638)' },
  other: { label: 'Other', color: 'oklch(0.809 0.105 251.813)' },
};

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

export default function DashboardOverview({ onNavigate, storageUsed, fileCount }: DashboardOverviewProps) {
  const { user, getVaultKey } = useAuth();
  const [recentActivity, setRecentActivity] = useState<AuditLogEntry[]>([]);
  const [recentFiles, setRecentFiles] = useState<DecryptedFile[]>([]);
  const [fileTypeData, setFileTypeData] = useState<{ category: string; count: number; size: number }[]>([]);
  const [totalStorage, setTotalStorage] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const [folderCount, setFolderCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const username = user?.email ? user.email.split('@')[0] : 'User';
  const storageLimit = 10 * 1024 * 1024 * 1024;
  const storagePercent = Math.min(((storageUsed || totalStorage) / storageLimit) * 100, 100);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const vaultKey = getVaultKey();

      const [activityRes, filesRes, foldersRes] = await Promise.allSettled([
        api.listAuditLog({ limit: 5 }),
        api.listFiles(),
        api.listFolders(),
      ]);

      if (activityRes.status === 'fulfilled' && activityRes.value.success && activityRes.value.data) {
        setRecentActivity(activityRes.value.data.entries);
      }

      if (filesRes.status === 'fulfilled' && filesRes.value.success && filesRes.value.data && vaultKey) {
        const decrypted: DecryptedFile[] = [];
        const typeMap: Record<string, { count: number; size: number }> = {};

        for (const f of filesRes.value.data.files) {
          try {
            const result = await decryptFileMetadata(
              f.encryptedFileKey as EncryptedBlob,
              f.encryptedFilename as EncryptedBlob,
              f.encryptedMimeType as EncryptedBlob | null,
              vaultKey,
            );
            if (result.success && result.data) {
              const file: DecryptedFile = {
                id: f.id,
                filename: result.data.filename,
                mimeType: result.data.mimeType,
                size: f.encryptedSize,
                folderId: f.folderId,
                deletedAt: f.deletedAt,
                createdAt: f.createdAt,
                encryptedFileKey: f.encryptedFileKey,
              };
              decrypted.push(file);
              const cat = file.mimeType.split('/')[0];
              const category = ['image', 'video', 'audio'].includes(cat) ? cat : 
                             file.mimeType.includes('pdf') || file.mimeType.includes('document') || file.mimeType.includes('text') ? 'document' : 'other';
              if (!typeMap[category]) typeMap[category] = { count: 0, size: 0 };
              typeMap[category].count += 1;
              typeMap[category].size += file.size;
            }
          } catch { /* skip */ }
        }

        decrypted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setRecentFiles(decrypted.slice(0, 5));
        setTotalFiles(decrypted.length);
        setTotalStorage(decrypted.reduce((acc, f) => acc + f.size, 0));
        setFileTypeData(Object.entries(typeMap).map(([category, data]) => ({ category, ...data })));
      }

      if (foldersRes.status === 'fulfilled' && foldersRes.value.success && foldersRes.value.data) {
        setFolderCount(foldersRes.value.data.folders.length);
      }
    } catch { /* silently fail */ }
    setIsLoading(false);
  }, [getVaultKey]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const effectiveFiles = fileCount || totalFiles;
  const effectiveStorage = storageUsed || totalStorage;

  const chartData = fileTypeData.length > 0 ? fileTypeData.map(d => ({
    category: d.category.charAt(0).toUpperCase() + d.category.slice(1),
    files: d.count,
    fill: storageChartConfig[d.category === 'document' ? 'documents' : d.category === 'image' ? 'images' : d.category === 'video' ? 'videos' : d.category === 'audio' ? 'audio' : 'other']?.color || 'oklch(0.809 0.105 251.813)',
  })) : [];

  return (
    <PageShell className="p-4 sm:p-6 lg:p-8 min-w-0 overflow-hidden">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="space-y-6"
      >
        <motion.div variants={itemVariants}>
          <PageHeader
            eyebrow="§ VAULT · 01_OVERVIEW"
            title={`Welcome back, ${username}`}
            italicWord="."
            subtitle="Encrypted client-side. Decrypted only on your devices. Here's the current state of your vault."
            trailing={
              <div className="flex flex-wrap items-center gap-2">
                <MonoChip tone="primary">XChaCha20-Poly1305</MonoChip>
                <MonoChip tone="ok">ZERO-KNOWLEDGE</MonoChip>
                <MonoChip>CLIENT-SIDE</MonoChip>
              </div>
            }
          />
        </motion.div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <motion.div variants={itemVariants}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => onNavigate('my-files')}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">Total Files</p>
                  <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FileIcon className="size-4 text-primary" />
                  </div>
                </div>
                <p className="text-2xl font-bold text-foreground mt-2">{effectiveFiles}</p>
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <Folder className="size-3" />
                  {folderCount} folder{folderCount !== 1 ? 's' : ''}
                </p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={itemVariants}>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">Storage Used</p>
                  <div className="size-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <HardDrive className="size-4 text-blue-500" />
                  </div>
                </div>
                <p className="text-2xl font-bold text-foreground mt-2">{formatSize(effectiveStorage)}</p>
                <div className="mt-2">
                  <Progress value={storagePercent} className="h-1.5" />
                  <p className="text-xs text-muted-foreground mt-1">{storagePercent.toFixed(1)}% of 10 GB</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={itemVariants}>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">Encryption</p>
                  <div className="size-9 rounded-lg bg-green-500/10 flex items-center justify-center">
                    <ShieldCheck className="size-4 text-green-500" />
                  </div>
                </div>
                <p className="text-2xl font-bold text-foreground mt-2">Active</p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
                  <TrendingUp className="size-3" />
                  Zero-knowledge proof
                </p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={itemVariants}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => onNavigate('shared')}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">File Types</p>
                  <div className="size-9 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <Share2 className="size-4 text-purple-500" />
                  </div>
                </div>
                <p className="text-2xl font-bold text-foreground mt-2">{fileTypeData.length}</p>
                <p className="text-xs text-muted-foreground mt-1">unique categories</p>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-7 gap-4">
          <motion.div variants={itemVariants} className="lg:col-span-4">
            <Card className="h-full">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Files by Category</CardTitle>
                  <Badge variant="secondary" className="text-xs">
                    {effectiveFiles} total
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {chartData.length > 0 ? (
                  <ChartContainer config={storageChartConfig} className="h-[220px] w-full">
                    <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 16 }}>
                      <YAxis
                        dataKey="category"
                        type="category"
                        tickLine={false}
                        axisLine={false}
                        width={80}
                        tick={{ fontSize: 12 }}
                      />
                      <XAxis type="number" hide />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar
                        dataKey="files"
                        radius={[0, 6, 6, 0]}
                        fill="var(--color-primary)"
                      />
                    </BarChart>
                  </ChartContainer>
                ) : (
                  <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
                    <div className="text-center">
                      <FileIcon className="size-8 mx-auto mb-2 text-muted-foreground/30" />
                      <p>No files uploaded yet</p>
                      <Button
                        variant="link"
                        size="sm"
                        className="mt-1"
                        onClick={() => onNavigate('my-files')}
                      >
                        Upload your first file
                        <ArrowRight className="size-3 ml-1" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={itemVariants} className="lg:col-span-3">
            <Card className="h-full">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Recent Activity</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground gap-1"
                    onClick={() => onNavigate('activity')}
                  >
                    View all
                    <ArrowRight className="size-3" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {recentActivity.length > 0 ? (
                  <div className="space-y-3">
                    {recentActivity.map((entry, i) => {
                      const config = ACTION_CONFIG[entry.action] || {
                        label: entry.action,
                        icon: Clock,
                        color: 'text-muted-foreground',
                        bg: 'bg-muted',
                      };
                      const Icon = config.icon;
                      return (
                        <motion.div
                          key={entry.id}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className="flex items-center gap-3"
                        >
                          <div className={`size-8 rounded-lg ${config.bg} flex items-center justify-center shrink-0`}>
                            <Icon className={`size-3.5 ${config.color}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{config.label}</p>
                            <p className="text-xs text-muted-foreground">{timeAgo(entry.createdAt)}</p>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="h-[180px] flex items-center justify-center text-sm text-muted-foreground">
                    <div className="text-center">
                      <Clock className="size-8 mx-auto mb-2 text-muted-foreground/30" />
                      <p>No activity yet</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Recent Files</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground gap-1"
                  onClick={() => onNavigate('my-files')}
                >
                  View all files
                  <ArrowRight className="size-3" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {recentFiles.length > 0 ? (
                <div className="space-y-2">
                  {recentFiles.map((file, i) => (
                    <motion.div
                      key={file.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-muted/50 transition-colors"
                    >
                      <div className="size-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <FileIcon className="size-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{file.filename}</p>
                        <p className="text-xs text-muted-foreground">{formatSize(file.size)}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="secondary" className="text-xs">
                          <Lock className="size-3 mr-1" />
                          Encrypted
                        </Badge>
                        <span className="text-xs text-muted-foreground">{timeAgo(file.createdAt)}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  <FileIcon className="size-8 mx-auto mb-2 text-muted-foreground/30" />
                  <p>No files in your vault yet</p>
                  <Button
                    variant="link"
                    size="sm"
                    className="mt-1"
                    onClick={() => onNavigate('my-files')}
                  >
                    Go to All Files to upload
                    <ArrowRight className="size-3 ml-1" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <ShieldCheck className="size-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">Your vault is secured</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    All files are encrypted with your personal key. Nobody can access your data without your password.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1"
                  onClick={() => onNavigate('security')}
                >
                  Security
                  <ArrowRight className="size-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </PageShell>
  );
}
