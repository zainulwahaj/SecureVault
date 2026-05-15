'use client';

import { cn } from '@/lib/utils';

type MonoChipProps = {
  children: React.ReactNode;
  tone?: 'default' | 'ok' | 'danger' | 'primary';
  className?: string;
};

/**
 * Pill-shaped mono chip used to surface technical metadata
 * (algorithms, version numbers, status flags).
 */
export function MonoChip({ children, tone = 'default', className }: MonoChipProps) {
  const toneClasses =
    tone === 'ok'
      ? 'border-emerald-500/30 text-emerald-500'
      : tone === 'danger'
      ? 'border-destructive/30 text-destructive'
      : tone === 'primary'
      ? 'border-primary/30 text-primary'
      : 'border-border text-muted-foreground';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border bg-foreground/[0.03] px-2.5 py-1 font-mono text-[10.5px] tracking-[0.04em]',
        toneClasses,
        className,
      )}
    >
      {children}
    </span>
  );
}
