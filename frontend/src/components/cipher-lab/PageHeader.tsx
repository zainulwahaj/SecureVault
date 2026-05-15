'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

type PageHeaderProps = {
  eyebrow: string;
  title: string;
  italicWord?: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  className?: string;
};

/**
 * Cipher Lab page header: mono eyebrow + large display title with an italic
 * serif accent + subtitle. Optional trailing slot for actions.
 */
export function PageHeader({
  eyebrow,
  title,
  italicWord,
  subtitle,
  trailing,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn('mb-8 flex items-end justify-between gap-4 flex-wrap', className)}>
      <div>
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary mb-3">
          {eyebrow}
        </div>
        <h1 className="text-3xl sm:text-4xl font-medium tracking-[-0.03em] leading-[1.05] text-foreground">
          {title}
          {italicWord && (
            <span
              className="font-normal italic text-primary ml-1"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              {italicWord}
            </span>
          )}
          <span className="text-primary">.</span>
        </h1>
        {subtitle && (
          <p className="mt-2 text-sm text-muted-foreground max-w-2xl leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </header>
  );
}
