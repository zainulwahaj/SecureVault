'use client';

import Link from 'next/link';
import { Shield } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

export function AuthTopbar() {
  return (
    <div className="relative z-20 flex items-center justify-between px-8 py-5">
      <Link href="/" className="flex items-center gap-2.5">
        <div
          className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground"
          style={{ boxShadow: '0 0 24px oklch(from var(--primary) l c h / 0.45)' }}
        >
          <Shield size={18} strokeWidth={2.2} />
        </div>
        <div className="font-mono text-[15px] font-semibold tracking-[-0.02em]">
          secure<span className="text-primary">vault</span>
        </div>
      </Link>
      <div className="flex items-center gap-4">
        <div className="hidden items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground sm:flex">
          <span className="a-pulse inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
          SECURE CONNECTION · TLS 1.3
        </div>
        <ThemeToggle />
      </div>
    </div>
  );
}
