'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

type TerminalCardProps = {
  filename: string;
  status?: string;
  statusTone?: 'ok' | 'warn' | 'danger';
  children: React.ReactNode;
  className?: string;
};

/**
 * Bordered card with a faux terminal chrome (traffic lights + filename).
 * Used to surface technical detail panes on internal screens.
 */
export function TerminalCard({
  filename,
  status = 'live',
  statusTone = 'ok',
  children,
  className,
}: TerminalCardProps) {
  const dotColor =
    statusTone === 'warn'
      ? 'bg-amber-500'
      : statusTone === 'danger'
      ? 'bg-destructive'
      : 'bg-emerald-500';
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-foreground/[0.04] to-transparent backdrop-blur',
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
        <div className="flex gap-1.5">
          {['#FF5F57', '#FEBC2E', '#28C840'].map((c) => (
            <span key={c} className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
          ))}
        </div>
        <span className="font-mono text-[11px] tracking-[0.05em] text-muted-foreground/80">
          {filename}
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
          <span className={cn('h-1.5 w-1.5 rounded-full a-pulse', dotColor)} />
          {status}
        </span>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}
