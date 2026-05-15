'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

type CalloutLineProps = {
  icon: React.ReactNode;
  tone?: 'primary' | 'danger';
  children: React.ReactNode;
};

export function CalloutLine({ icon, tone = 'primary', children }: CalloutLineProps) {
  return (
    <div className="flex items-start gap-2.5 rounded-[10px] border border-border bg-foreground/[0.03] px-3.5 py-2.5">
      <span
        className={cn(
          'mt-0.5 shrink-0',
          tone === 'danger' ? 'text-destructive' : 'text-primary',
        )}
      >
        {icon}
      </span>
      <span className="text-[13px] leading-[1.5] text-muted-foreground">{children}</span>
    </div>
  );
}
