'use client';

import { type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';

export interface AlertProps {
  variant?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  children: ReactNode;
  className?: string;
  onClose?: () => void;
}

const variants = {
  info: {
    container: 'bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800',
    icon: 'text-primary-500',
    title: 'text-primary-800 dark:text-primary-200',
    text: 'text-primary-700 dark:text-primary-300',
  },
  success: {
    container: 'bg-success-50 dark:bg-success-900/20 border-success-200 dark:border-success-800',
    icon: 'text-success-500',
    title: 'text-success-800 dark:text-success-200',
    text: 'text-success-700 dark:text-success-300',
  },
  warning: {
    container: 'bg-warning-50 dark:bg-warning-900/20 border-warning-200 dark:border-warning-800',
    icon: 'text-warning-500',
    title: 'text-warning-800 dark:text-warning-200',
    text: 'text-warning-700 dark:text-warning-300',
  },
  error: {
    container: 'bg-error-50 dark:bg-error-900/20 border-error-200 dark:border-error-800',
    icon: 'text-error-500',
    title: 'text-error-800 dark:text-error-200',
    text: 'text-error-700 dark:text-error-300',
  },
};

const icons = {
  info: InformationCircleIcon,
  success: CheckCircleIcon,
  warning: ExclamationTriangleIcon,
  error: XCircleIcon,
};

export function Alert({
  variant = 'info',
  title,
  children,
  className,
  onClose,
}: AlertProps) {
  const Icon = icons[variant];
  const styles = variants[variant];

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={clsx(
        'p-4 rounded-xl border flex gap-3',
        styles.container,
        className
      )}
    >
      <Icon className={clsx('w-5 h-5 flex-shrink-0 mt-0.5', styles.icon)} />
      <div className="flex-1 min-w-0">
        {title && (
          <h4 className={clsx('font-semibold text-sm', styles.title)}>{title}</h4>
        )}
        <div className={clsx('text-sm', title && 'mt-1', styles.text)}>
          {children}
        </div>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className={clsx(
            'flex-shrink-0 p-1 rounded-lg transition-colors',
            'hover:bg-black/5 dark:hover:bg-white/5',
            styles.icon
          )}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </motion.div>
  );
}
