'use client';

import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PageLoaderProps {
  className?: string;
}

export function PageLoader({ className }: PageLoaderProps) {
  return (
    <Loader2
      role="status"
      aria-label="Loading"
      className={cn('size-8 animate-spin text-primary', className)}
    />
  );
}
