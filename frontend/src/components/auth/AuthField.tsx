'use client';

import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

type AuthFieldProps = {
  id?: string;
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  autoComplete?: string;
  disabled?: boolean;
  showToggle?: boolean;
  toggled?: boolean;
  onToggle?: () => void;
  hint?: React.ReactNode;
  error?: string;
  monoLabel?: boolean;
  monoValue?: boolean;
  required?: boolean;
};

export function AuthField({
  id,
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  autoFocus,
  autoComplete,
  disabled,
  showToggle,
  toggled,
  onToggle,
  hint,
  error,
  monoLabel,
  monoValue,
  required,
}: AuthFieldProps) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label
          htmlFor={id}
          className={cn(
            'font-medium',
            monoLabel
              ? 'font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground'
              : 'text-[13px] text-muted-foreground',
          )}
        >
          {label}
        </label>
        {hint ? (
          <span className="font-mono text-[11px] text-muted-foreground/70">{hint}</span>
        ) : null}
      </div>
      <div className="relative">
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          disabled={disabled}
          required={required}
          className={cn(
            'w-full h-12 rounded-[10px] px-3.5',
            'bg-foreground/[0.03] dark:bg-foreground/[0.03]',
            'border border-border',
            'text-[14px] text-foreground placeholder:text-muted-foreground/60',
            'outline-none transition-all',
            'focus:border-primary focus:ring-[3px] focus:ring-primary/20',
            showToggle && 'pr-11',
            monoValue && 'font-mono tracking-wide',
            error && 'border-destructive focus:border-destructive focus:ring-destructive/20',
          )}
        />
        {showToggle ? (
          <button
            type="button"
            onClick={onToggle}
            tabIndex={-1}
            aria-label={toggled ? 'Hide password' : 'Show password'}
            className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-md text-muted-foreground/70 transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
          >
            {toggled ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>
        ) : null}
      </div>
      {error ? (
        <div className="mt-1.5 font-mono text-[12px] text-destructive">! {error}</div>
      ) : null}
    </div>
  );
}
