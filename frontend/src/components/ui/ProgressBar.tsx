'use client';

import { motion } from 'framer-motion';
import { clsx } from 'clsx';

export interface ProgressBarProps {
  value: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  color?: 'primary' | 'success' | 'warning' | 'error';
  showLabel?: boolean;
  animated?: boolean;
  className?: string;
}

const sizes = {
  sm: 'h-1',
  md: 'h-2',
  lg: 'h-3',
};

const colors = {
  primary: 'from-primary-600 to-primary-500',
  success: 'from-success-600 to-success-500',
  warning: 'from-warning-600 to-warning-500',
  error: 'from-error-600 to-error-500',
};

export function ProgressBar({
  value,
  max = 100,
  size = 'md',
  color = 'primary',
  showLabel = false,
  animated = true,
  className,
}: ProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={className}>
      {showLabel && (
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Progress
          </span>
          <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
            {Math.round(percentage)}%
          </span>
        </div>
      )}
      <div
        className={clsx(
          'w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden',
          sizes[size]
        )}
      >
        <motion.div
          className={clsx(
            'h-full rounded-full bg-gradient-to-r',
            colors[color]
          )}
          initial={animated ? { width: 0 } : false}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

export function ProgressCircle({
  value,
  max = 100,
  size = 60,
  strokeWidth = 4,
  color = 'primary',
  showLabel = true,
}: {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  color?: 'primary' | 'success' | 'warning' | 'error';
  showLabel?: boolean;
}) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  const strokeColors = {
    primary: 'stroke-primary-500',
    success: 'stroke-success-500',
    warning: 'stroke-warning-500',
    error: 'stroke-error-500',
  };

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          className="stroke-slate-200 dark:stroke-slate-700 fill-none"
        />
        {/* Progress circle */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className={clsx('fill-none', strokeColors[color])}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          style={{
            strokeDasharray: circumference,
          }}
        />
      </svg>
      {showLabel && (
        <span className="absolute text-sm font-semibold text-slate-700 dark:text-slate-300">
          {Math.round(percentage)}%
        </span>
      )}
    </div>
  );
}
