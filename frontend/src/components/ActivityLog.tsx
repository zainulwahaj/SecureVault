'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import * as api from '@/lib/api';
import type { AuditLogEntry } from '@/types';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
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

const PAGE_SIZE = 20;

const ACTION_CONFIG: Record<string, { label: string; icon: typeof FileIcon; color: string }> = {
  'file.upload': { label: 'File uploaded', icon: FileIcon, color: 'text-primary' },
  'file.download': { label: 'File downloaded', icon: FileIcon, color: 'text-blue-500' },
  'file.delete': { label: 'File deleted', icon: Trash2, color: 'text-destructive' },
  'file.restore': { label: 'File restored', icon: FileIcon, color: 'text-green-500' },
  'file.move': { label: 'File moved', icon: FileIcon, color: 'text-amber-500' },
  'folder.create': { label: 'Folder created', icon: FolderIcon, color: 'text-primary' },
  'folder.delete': { label: 'Folder deleted', icon: FolderIcon, color: 'text-destructive' },
  'folder.rename': { label: 'Folder renamed', icon: FolderIcon, color: 'text-amber-500' },
  'folder.move': { label: 'Folder moved', icon: FolderIcon, color: 'text-amber-500' },
  'share.create': { label: 'File shared', icon: Share2, color: 'text-purple-500' },
  'share.revoke': { label: 'Share revoked', icon: Share2, color: 'text-destructive' },
  'link.create': { label: 'Link created', icon: Share2, color: 'text-purple-500' },
  'link.revoke': { label: 'Link revoked', icon: Share2, color: 'text-destructive' },
  'auth.login': { label: 'Logged in', icon: LogIn, color: 'text-green-500' },
  'auth.logout': { label: 'Logged out', icon: LogIn, color: 'text-muted-foreground' },
  'mfa.enable': { label: 'MFA enabled', icon: ShieldCheck, color: 'text-green-500' },
  'mfa.disable': { label: 'MFA disabled', icon: ShieldCheck, color: 'text-destructive' },
  'mfa.verify': { label: 'MFA verified', icon: Key, color: 'text-green-500' },
};

function getActionConfig(action: string) {
  return ACTION_CONFIG[action] ?? {
    label: action.replace('.', ' '),
    icon: ClipboardList,
    color: 'text-muted-foreground',
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
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <ClipboardList className="size-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Activity</h3>
            <p className="text-sm text-muted-foreground">
              Recent activity in your vault
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => loadActivity(offset)}
          disabled={isLoading}
        >
          <RefreshCw className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {isLoading && entries.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Spinner className="size-8" />
        </div>
      ) : entries.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ClipboardList />
            </EmptyMedia>
            <EmptyTitle>No activity yet</EmptyTitle>
            <EmptyDescription>
              Actions like file uploads, shares, and logins will appear here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="space-y-1">
            <AnimatePresence>
              {entries.map((entry, index) => {
                const config = getActionConfig(entry.action);
                const Icon = config.icon;
                return (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className="flex items-center gap-4 px-4 py-3 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className={`flex-shrink-0 ${config.color}`}>
                      <Icon className="size-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {config.label}
                      </p>
                      {entry.resourceType && (
                        <p className="text-xs text-muted-foreground truncate">
                          {entry.resourceType}
                          {entry.resourceId ? ` · ${entry.resourceId.slice(0, 8)}…` : ''}
                        </p>
                      )}
                    </div>
                    <div className="flex-shrink-0 text-xs text-muted-foreground">
                      {formatTime(entry.createdAt)}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
              <p className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                  <ChevronLeft className="size-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={offset + PAGE_SIZE >= totalCount}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  Next
                  <ChevronRight className="size-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
