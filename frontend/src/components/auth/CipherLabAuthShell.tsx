'use client';

import * as React from 'react';
import { AuthTopbar } from './AuthTopbar';
import { CipherLabRightPanel } from './CipherLabRightPanel';

type Props = {
  mode: 'login' | 'register';
  children: React.ReactNode;
};

export function CipherLabAuthShell({ mode, children }: Props) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="a-grid pointer-events-none absolute inset-0" />
      <div
        className="pointer-events-none absolute"
        style={{
          top: -300,
          left: '20%',
          width: 800,
          height: 600,
          filter: 'blur(40px)',
          background:
            'radial-gradient(ellipse at center, oklch(from var(--primary) l c h / 0.18), transparent 60%)',
        }}
      />

      <AuthTopbar />

      <div className="relative grid min-h-[calc(100vh-64px)] grid-cols-1 lg:grid-cols-2">
        <div className="flex items-center justify-center px-8 pb-20 pt-10 sm:px-12">
          <div className="w-full max-w-[460px]">{children}</div>
        </div>
        <CipherLabRightPanel mode={mode} />
      </div>
    </div>
  );
}
