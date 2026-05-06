'use client';

import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import * as api from '@/lib/api';
import type { AuditLogEntry } from '@/types';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import {
  ClipboardList,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  FileIcon,
  FolderIcon,
  Share2,
  Trash2,
  LogIn,
  Key,
} from 'lucide-react';
import { motion } from 'framer-motion';

const PAGE_SIZE = 20;

const ACTION_CONFIG: Record<string, { label: string; icon: typeof FileIcon; color: string; bg: string }> = {
  'file.upload': { label: 'File uploaded', icon: FileIcon, color: 'text-primary', bg: 'bg-primary/10' },
  'file.download': { label: 'File downloaded', icon: FileIcon, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  'file.delete': { label: 'File deleted', icon: Trash2, color: 'text-destructive', bg: 'bg-destructive/10' },
  'file.restore': { label: 'File restored', icon: FileIcon, color: 'text-green-500', bg: 'bg-green-500/10' },
  'file.move': { label: 'File moved', icon: FileIcon, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  'folder.create': { label: 'Folder created', icon: FolderIcon, color: 'text-primary', bg: 'bg-primary/10' },
  'folder.delete': { label: 'Folder deleted', icon: FolderIcon, color: 'text-destructive', bg: 'bg-destructive/10' },
  'folder.rename': { label: 'Folder renamed', icon: FolderIcon, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  'folder.move': { label: 'Folder moved', icon: FolderIcon, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  'share.create': { label: 'File shared', icon: Share2, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  'share.revoke': { label: 'Share revoked', icon: Share2, color: 'text-destructive', bg: 'bg-destructive/10' },
  'link.create': { label: 'Link created', icon: Share2, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  'link.revoke': { label: 'Link revoked', icon: Share2, color: 'text-destructive', bg: 'bg-destructive/10' },
  'auth.login': { label: 'Logged in', icon: LogIn, color: 'text-green-500', bg: 'bg-green-500/10' },
  'auth.logout': { label: 'Logged out', icon: LogIn, color: 'text-muted-foreground', bg: 'bg-muted' },
  'mfa.enable': { label: 'MFA enabled', icon: ShieldCheck, color: 'text-green-500', bg: 'bg-green-500/10' },
  'mfa.disable': { label: 'MFA disabled', icon: ShieldCheck, color: 'text-destructive', bg: 'bg-destructive/10' },
  'mfa.verify': { label: 'MFA verified', icon: Key, color: 'text-green-500', bg: 'bg-green-500/10' },
};

function getActionConfig(action: string) {
  return ACTION_CONFIG[action] ?? {
    label: action.replace('.', ' '),
    icon: ClipboardList,
    color: 'text-muted-foreground',
    bg: 'bg-muted',
  };
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString();
}

export default function ActivityLog() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [offset, setOffset] = useState(0);

  const loadActivity = useCallback(async (pageOffset: number) => {
    setIsLoading(true);
    try {
      const result = await api.listAuditLog({ limit: PAGE_SIZE, offset: pageOffset });
      if (result.success && result.data) {
        setEntries(result.data.entries);
        setTotalCount(result.data.totalCount);
      } else {
        toast.error('Failed to load activity');
      }
    } catch {
      toast.error('Failed to load activity');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadActivity(offset);
  }, [loadActivity, offset]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-w-0 overflow-hidden">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-6"
      >
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Activity</h1>
          <p className="text-sm text-muted-foreground mt-1">Recent activity in your vault</p>
        </div>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => loadActivity(offset)}
          disabled={isLoading}
          className="shrink-0"
        >
          <RefreshCw className={`size-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </motion.div>

      {isLoading && entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Spinner className="size-6" />
          <p className="text-sm text-muted-foreground">Loading activity...</p>
        </div>
      ) : entries.length === 0 ? (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
          <Empty className="py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon"><ClipboardList /></EmptyMedia>
              <EmptyTitle>No activity yet</EmptyTitle>
              <EmptyDescription>Actions like file uploads, shares, and logins will appear here.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
            {entries.map((entry, index) => {
              const config = getActionConfig(entry.action);
              const Icon = config.icon;
              return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: index * 0.02 }}
                  className="flex items-center gap-4 px-4 py-3.5 bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className={`shrink-0 size-9 rounded-lg ${config.bg} flex items-center justify-center`}>
                    <Icon className={`size-4 ${config.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{config.label}</p>
                    {entry.resourceType && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {entry.resourceType}
                        {entry.resourceId ? ` · ${entry.resourceId.slice(0, 8)}...` : ''}
                      </p>
                    )}
                  </div>
                  <Badge variant="outline" className="shrink-0 text-xs font-normal text-muted-foreground">
                    {formatTime(entry.createdAt)}
                  </Badge>
                </motion.div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6">
              <p className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  className="gap-1"
                >
                  <ChevronLeft className="size-3.5" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset + PAGE_SIZE >= totalCount}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  className="gap-1"
                >
                  Next
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
