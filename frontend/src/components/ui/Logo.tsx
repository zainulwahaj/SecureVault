'use client';

import { Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
  animated?: boolean;
}

const sizeMap = {
  sm: { icon: 'size-5', text: 'text-base' },
  md: { icon: 'size-6', text: 'text-lg' },
  lg: { icon: 'size-8', text: 'text-xl' },
  xl: { icon: 'size-10', text: 'text-2xl' },
};

export function Logo({ size = 'md', showText = true, className }: LogoProps) {
  const s = sizeMap[size];
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex items-center justify-center rounded-lg bg-primary p-1.5">
        <Shield className={cn(s.icon, 'text-primary-foreground')} />
      </div>
      {showText && (
        <span className={cn(s.text, 'font-bold tracking-tight')}>
          <span className="text-foreground">Secure</span>
          <span className="text-primary">Vault</span>
        </span>
      )}
    </div>
  );
}

export function LogoLoader() {
  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <div className="animate-pulse">
        <Logo size="xl" showText={false} />
      </div>
      <p className="text-sm text-muted-foreground">Loading...</p>
    </div>
  );
}
