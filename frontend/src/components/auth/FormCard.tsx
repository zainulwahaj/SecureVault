'use client';

import * as React from 'react';

type FormCardProps = {
  eyebrow: string;
  titleLeft: string;
  italicWord: string;
  titleRight?: string;
  subtitle: string;
  children: React.ReactNode;
};

export function FormCard({
  eyebrow,
  titleLeft,
  italicWord,
  titleRight = '.',
  subtitle,
  children,
}: FormCardProps) {
  return (
    <div>
      <div className="mb-3.5 font-mono text-[11px] uppercase tracking-[0.18em] text-primary">
        {eyebrow}
      </div>
      <h1 className="m-0 text-[52px] font-medium leading-none tracking-[-0.04em]">
        {titleLeft}
        <span
          className="font-serif font-normal italic text-primary"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          {italicWord}
        </span>
        {titleRight}
      </h1>
      <p className="mt-4 max-w-[420px] text-[15px] leading-[1.55] text-muted-foreground">
        {subtitle}
      </p>
      <div className="mt-9">{children}</div>
    </div>
  );
}
