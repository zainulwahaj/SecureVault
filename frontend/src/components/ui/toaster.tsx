'use client';

import { Toaster as SonnerToaster } from 'sonner';

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <SonnerToaster position="bottom-right" richColors closeButton />
    </>
  );
}

// Re-export toast from sonner for convenience
export { toast } from 'sonner';
