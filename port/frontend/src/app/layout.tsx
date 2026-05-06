import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '@/context/AuthContext';
import { ThemeScript } from '@/components/ui/ThemeToggle';
import { ToastProvider } from '@/components/ui/toaster';
import { ConfirmProvider } from '@/components/ui/ConfirmDialog';
import { TooltipProvider } from '@/components/ui/tooltip';
import './globals.css';

export const metadata: Metadata = {
  title: 'SecureVault | Zero-Knowledge File Encryption',
  description:
    'A zero-knowledge secure file vault where all encryption happens client-side. Your files, your keys, your privacy.',
  keywords: ['encryption', 'secure', 'vault', 'files', 'privacy', 'zero-knowledge'],
  authors: [{ name: 'SecureVault' }],
  icons: {
    icon: '/favicon.svg',
    apple: '/favicon.svg',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700;800&family=Instrument+Serif:ital@0;1&family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen antialiased">
        <AuthProvider>
          <TooltipProvider>
            <ToastProvider>
              <ConfirmProvider>{children}</ConfirmProvider>
            </ToastProvider>
          </TooltipProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
