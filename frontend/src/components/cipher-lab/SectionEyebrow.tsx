'use client';

import { cn } from '@/lib/utils';

type SectionEyebrowProps = {
  children: React.ReactNode;
  className?: string;
};

/**
 * The `§ SECTION_NAME` label that prefixes Cipher Lab cards.
 */
export function SectionEyebrow({ children, className }: SectionEyebrowProps) {
  return (
    <div
      className={cn(
        'font-mono text-[11px] uppercase tracking-[0.18em] text-primary',
        className,
      )}
    >
      {children}
    </div>
  );
}
