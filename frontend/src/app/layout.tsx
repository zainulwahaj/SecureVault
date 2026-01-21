import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '@/context/AuthContext';
import { ThemeScript } from '@/components/ui/ThemeToggle';
import { ToastProvider } from '@/components/ui/Toast';
import { ConfirmProvider } from '@/components/ui/ConfirmDialog';
import './globals.css';

export const metadata: Metadata = {
  title: 'SecureVault | Zero-Knowledge File Encryption',
  description: 'A zero-knowledge secure file vault where all encryption happens client-side. Your files, your keys, your privacy.',
  keywords: ['encryption', 'secure', 'vault', 'files', 'privacy', 'zero-knowledge'],
  authors: [{ name: 'SecureVault' }],
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="antialiased">
        <AuthProvider>
          <ToastProvider>
            <ConfirmProvider>
              <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
                {children}
              </div>
            </ConfirmProvider>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
