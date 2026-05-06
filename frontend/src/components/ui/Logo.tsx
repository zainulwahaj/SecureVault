'use client';

import { cn } from '@/lib/utils';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
}

const sizeMap = {
  sm: { box: 'size-7', path: 'size-4', text: 'text-base', gap: 'gap-2' },
  md: { box: 'size-8', path: 'size-5', text: 'text-lg', gap: 'gap-2.5' },
  lg: { box: 'size-10', path: 'size-6', text: 'text-xl', gap: 'gap-3' },
  xl: { box: 'size-12', path: 'size-7', text: 'text-2xl', gap: 'gap-3' },
};

function VaultIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M12 2L4 6v6c0 5.25 3.4 10.15 8 11.4C16.6 22.15 20 17.25 20 12V6l-8-4z"
        fill="currentColor"
        opacity="0.15"
      />
      <path
        d="M12 2L4 6v6c0 5.25 3.4 10.15 8 11.4C16.6 22.15 20 17.25 20 12V6l-8-4z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 8v4m0 0v1.5m0-1.5h0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="13.5" r="0.75" fill="currentColor" />
    </svg>
  );
}

export function Logo({ size = 'md', showText = true, className }: LogoProps) {
  const s = sizeMap[size];
  return (
    <div className={cn('flex items-center', s.gap, className)}>
      <div className={cn(
        'flex items-center justify-center rounded-xl bg-primary text-primary-foreground',
        s.box
      )}>
        <VaultIcon className={s.path} />
      </div>
      {showText && (
        <span className={cn(s.text, 'font-semibold tracking-tight')}>
          <span className="text-foreground">Secure</span>
          <span className="text-primary">Vault</span>
        </span>
      )}
    </div>
  );
}

export { default as LogoLoader } from './tetris-loader-wrapper';
