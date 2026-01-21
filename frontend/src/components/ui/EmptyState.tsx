'use client';

import { type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import { Button } from './Button';
import {
  FolderIcon,
  MagnifyingGlassIcon,
  ShareIcon,
} from '@heroicons/react/24/outline';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode | {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={clsx(
        'flex flex-col items-center justify-center py-12 px-6 text-center',
        className
      )}
    >
      {icon && (
        <div className="w-16 h-16 mb-4 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">
          {description}
        </p>
      )}
      {action && (
        <div className="mt-4">
          {typeof action === 'object' && 'label' in action ? (
            <Button onClick={action.onClick}>{action.label}</Button>
          ) : (
            action
          )}
        </div>
      )}
    </motion.div>
  );
}

// Pre-built empty states for common scenarios

// NoFiles - for empty vault
export function NoFiles({
  title = "No files yet",
  description = "Upload your first file to get started. All files are encrypted client-side before upload.",
  action,
}: {
  title?: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <EmptyState
      icon={<FolderIcon className="w-8 h-8" />}
      title={title}
      description={description}
      action={action}
    />
  );
}

// NoSearchResults - for empty search
export function NoSearchResults({
  query,
  title = "No results found",
  description,
}: {
  query?: string;
  title?: string;
  description?: string;
}) {
  return (
    <EmptyState
      icon={<MagnifyingGlassIcon className="w-8 h-8" />}
      title={title}
      description={description || (query ? `We couldn't find anything matching "${query}". Try adjusting your search.` : "Try adjusting your search terms.")}
    />
  );
}

// NoSharedFiles - for empty shared files
export function NoSharedFiles({
  title = "No shared files",
  description = "Files that others share with you will appear here. You can also share your files with others.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <EmptyState
      icon={<ShareIcon className="w-8 h-8" />}
      title={title}
      description={description}
    />
  );
}

// Legacy exports for backward compatibility
export function NoFilesEmptyState({ onUpload }: { onUpload?: () => void }) {
  return (
    <NoFiles
      action={onUpload ? { label: "Upload File", onClick: onUpload } : undefined}
    />
  );
}

export function NoSearchResultsEmptyState({ query }: { query: string }) {
  return <NoSearchResults query={query} />;
}

export function NoSharedFilesEmptyState() {
  return <NoSharedFiles />;
}
