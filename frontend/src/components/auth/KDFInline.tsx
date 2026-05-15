'use client';

import { visualHash } from '@/lib/auth/passwordStrength';

type KDFInlineProps = {
  password: string;
  active: boolean;
};

export function KDFInline({ password, active }: KDFInlineProps) {
  if (!password && !active) return null;
  const hash = visualHash(password || ' ', 48);
  const dots = password.replace(/./g, '•');
  return (
    <div
      className="mt-2.5 flex items-center gap-2.5 overflow-hidden rounded-lg border border-dashed border-border bg-foreground/[0.03] px-3 py-2.5 font-mono text-[11px] text-muted-foreground/80"
      aria-hidden
    >
      <span className="whitespace-nowrap text-primary">
        {active ? '⟳ deriving' : 'preview →'}
      </span>
      <span className="overflow-hidden text-ellipsis whitespace-nowrap text-muted-foreground">
        pbkdf2(sha256, &quot;{dots}&quot;, 100000) ={' '}
        <span className="text-primary">{hash}</span>
      </span>
    </div>
  );
}
