'use client';

import { type ReactNode } from 'react';
import { clsx } from 'clsx';

export interface BadgeProps {
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'error' | 'outline';
  size?: 'sm' | 'md';
  children: ReactNode;
  className?: string;
  dot?: boolean;
}

const variants = {
  default: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300',
  primary: 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300',
  success: 'bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-300',
  warning: 'bg-warning-100 dark:bg-warning-900/30 text-warning-700 dark:text-warning-300',
  error: 'bg-error-100 dark:bg-error-900/30 text-error-700 dark:text-error-300',
  outline: 'bg-transparent border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400',
};

const dotColors = {
  default: 'bg-slate-500',
  primary: 'bg-primary-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  error: 'bg-error-500',
  outline: 'bg-slate-500',
};

const sizes = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-xs',
};

export function Badge({
  variant = 'default',
  size = 'md',
  children,
  className,
  dot = false,
}: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 font-medium rounded-full',
        variants[variant],
        sizes[size],
        className
      )}
    >
      {dot && (
        <span className={clsx('w-1.5 h-1.5 rounded-full', dotColors[variant])} />
      )}
      {children}
    </span>
  );
}
