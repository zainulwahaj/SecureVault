'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

type PageShellProps = {
  children: React.ReactNode;
  /** Render the subtle Cipher Lab grid + radial accent behind the page. */
  withBackground?: boolean;
  className?: string;
};

/**
 * Wraps an internal view in the Cipher Lab background treatment (grid +
 * radial accent) without changing the underlying layout density.
 */
export function PageShell({ children, withBackground = true, className }: PageShellProps) {
  return (
    <div className={cn('relative', className)}>
      {withBackground && (
        <>
          <div className="a-grid pointer-events-none absolute inset-0 opacity-30" />
          <div
            className="pointer-events-none absolute -top-40 right-0 h-[500px] w-[600px] opacity-60"
            style={{
              filter: 'blur(40px)',
              background:
                'radial-gradient(ellipse at center, oklch(from var(--primary) l c h / 0.12), transparent 60%)',
            }}
          />
        </>
      )}
      <div className="relative">{children}</div>
    </div>
  );
}
