'use client';

import { clsx } from 'clsx';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: 'primary' | 'white' | 'slate';
  className?: string;
}

const sizes = {
  sm: 'w-4 h-4 border-2',
  md: 'w-6 h-6 border-2',
  lg: 'w-8 h-8 border-3',
};

const colors = {
  primary: 'border-primary-600 border-t-transparent',
  white: 'border-white border-t-transparent',
  slate: 'border-slate-400 border-t-transparent',
};

export function Spinner({ size = 'md', color = 'primary', className }: SpinnerProps) {
  return (
    <div
      className={clsx(
        'animate-spin rounded-full',
        sizes[size],
        colors[color],
        className
      )}
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
}

export function LoadingScreen({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="fixed inset-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="text-center">
        <Spinner size="lg" />
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">{message}</p>
      </div>
    </div>
  );
}

export function LoadingDots() {
  return (
    <div className="flex items-center gap-1">
      <div className="w-2 h-2 rounded-full bg-primary-500 animate-bounce" style={{ animationDelay: '0ms' }} />
      <div className="w-2 h-2 rounded-full bg-primary-500 animate-bounce" style={{ animationDelay: '150ms' }} />
      <div className="w-2 h-2 rounded-full bg-primary-500 animate-bounce" style={{ animationDelay: '300ms' }} />
    </div>
  );
}
