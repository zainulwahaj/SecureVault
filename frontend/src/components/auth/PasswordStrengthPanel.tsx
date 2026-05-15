'use client';

import { Check, X } from 'lucide-react';
import type { PasswordEvaluation } from '@/lib/auth/passwordStrength';

const CHECKS: { k: keyof PasswordEvaluation['checks']; label: string }[] = [
  { k: 'length8', label: '8+ characters' },
  { k: 'length12', label: '12+ characters' },
  { k: 'upperLower', label: 'aA mixed case' },
  { k: 'number', label: '0-9 number' },
  { k: 'symbol', label: '!@# symbol' },
];

type Props = {
  password: string;
  ev: PasswordEvaluation;
};

export function PasswordStrengthPanel({ password, ev }: Props) {
  if (!password) return null;
  return (
    <div className="mt-3 rounded-xl border border-border bg-foreground/[0.03] px-4 py-3.5">
      <div className="flex justify-between font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground/80">
        <span>
          STRENGTH ·{' '}
          <span style={{ color: ev.color }}>{ev.label.toUpperCase()}</span>
        </span>
        <span>
          {ev.entropyBits} bits · cracks in {ev.ttcLabel}
        </span>
      </div>
      <div className="mt-2 flex gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-sm transition-colors duration-200"
            style={{
              background: i <= ev.score ? ev.color : 'var(--border)',
            }}
          />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {CHECKS.map((c) => {
          const passed = ev.checks[c.k];
          return (
            <div
              key={c.k}
              className="flex items-center gap-1.5 font-mono text-[12px]"
              style={{ color: passed ? 'var(--foreground)' : 'var(--muted-foreground)' }}
            >
              <span
                className="grid h-[14px] w-[14px] place-items-center rounded-full"
                style={{
                  background: passed ? 'rgba(34,197,94,0.2)' : 'var(--border)',
                  color: passed ? '#22c55e' : 'var(--muted-foreground)',
                }}
              >
                {passed ? <Check size={9} strokeWidth={3} /> : <X size={9} strokeWidth={2.5} />}
              </span>
              {c.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
