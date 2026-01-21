'use client';

import { clsx } from 'clsx';
import { UserIcon } from '@heroicons/react/24/solid';

export interface AvatarProps {
  src?: string;
  alt?: string;
  name?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizes = {
  xs: 'w-6 h-6 text-xs',
  sm: 'w-8 h-8 text-sm',
  md: 'w-10 h-10 text-base',
  lg: 'w-12 h-12 text-lg',
  xl: 'w-16 h-16 text-xl',
};

const iconSizes = {
  xs: 'w-3 h-3',
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
  xl: 'w-8 h-8',
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getColorFromName(name: string): string {
  const colors = [
    'bg-primary-500',
    'bg-accent-500',
    'bg-success-500',
    'bg-warning-500',
    'bg-pink-500',
    'bg-purple-500',
    'bg-indigo-500',
    'bg-teal-500',
  ];
  
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  return colors[Math.abs(hash) % colors.length];
}

export function Avatar({ src, alt, name, size = 'md', className }: AvatarProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt || name || 'Avatar'}
        className={clsx(
          'rounded-full object-cover',
          'ring-2 ring-white dark:ring-slate-800',
          sizes[size],
          className
        )}
      />
    );
  }

  if (name) {
    return (
      <div
        className={clsx(
          'rounded-full flex items-center justify-center font-semibold text-white',
          'ring-2 ring-white dark:ring-slate-800',
          getColorFromName(name),
          sizes[size],
          className
        )}
      >
        {getInitials(name)}
      </div>
    );
  }

  return (
    <div
      className={clsx(
        'rounded-full flex items-center justify-center',
        'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400',
        'ring-2 ring-white dark:ring-slate-800',
        sizes[size],
        className
      )}
    >
      <UserIcon className={iconSizes[size]} />
    </div>
  );
}

export function AvatarGroup({
  children,
  max = 4,
  size = 'md',
}: {
  children: React.ReactNode[];
  max?: number;
  size?: AvatarProps['size'];
}) {
  const displayed = children.slice(0, max);
  const remaining = children.length - max;

  return (
    <div className="flex -space-x-2">
      {displayed}
      {remaining > 0 && (
        <div
          className={clsx(
            'rounded-full flex items-center justify-center font-semibold',
            'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
            'ring-2 ring-white dark:ring-slate-800',
            sizes[size]
          )}
        >
          +{remaining}
        </div>
      )}
    </div>
  );
}
