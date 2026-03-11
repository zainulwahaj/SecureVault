'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import MFAVerification from '@/components/MFAVerification';
import { Logo, LogoLoader } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { AlertCircle, Info, ShieldCheck } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState('');

  const { login, user, isAuthenticated, needsUnlock, isLoading, pendingMfa, vaultKey, completeMfaVerification, cancelMfaVerification } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (!isLoading && user && !pendingMfa) {
      router.push('/dashboard');
    }
  }, [user, isLoading, pendingMfa, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setStatus('');
    setIsSubmitting(true);

    try {
      if (!email || !password) {
        setError('Please fill in all fields');
        return;
      }

      if (password.length < 8) {
        setError('Password must be at least 8 characters');
        return;
      }

      setStatus('Deriving encryption keys...');

      const result = await login(email, password);

      if (result.success) {
        if (result.requiresMfa) {
          setStatus('');
        } else {
          setStatus('Success! Redirecting...');
          router.push('/dashboard');
        }
      } else {
        setError(result.error || 'Login failed');
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
      setStatus('');
    }
  }

  function handleMfaSuccess() {
    completeMfaVerification();
    router.push('/dashboard');
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LogoLoader />
      </div>
    );
  }

  if (pendingMfa && vaultKey) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <MFAVerification
          vaultKey={vaultKey}
          onSuccess={handleMfaSuccess}
          onCancel={cancelMfaVerification}
        />
      </div>
    );
  }

  return (
    <section className="bg-muted min-h-screen">
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>
      <div className="flex h-full min-h-screen items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="border-muted bg-background flex w-full max-w-sm flex-col items-center gap-y-8 rounded-md border px-6 py-12 shadow-md"
        >
          {/* Logo */}
          <div className="flex flex-col items-center gap-y-2">
            <Link href="/">
              <Logo animated />
            </Link>
            <h1 className="text-2xl font-semibold text-foreground">Welcome back</h1>
            <p className="text-sm text-muted-foreground">Sign in to access your encrypted vault</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              disabled={isSubmitting}
              required
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={isSubmitting}
              required
            />

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {status && !error && (
              <Alert>
                <Info className="size-4" />
                <AlertDescription className="flex items-center gap-2">
                  <Spinner className="size-3" />
                  {status}
                </AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 w-full"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <Spinner className="size-4" />
                  Authenticating...
                </span>
              ) : (
                'Sign In'
              )}
            </Button>
          </form>

          {/* Zero-knowledge notice */}
          <div className="flex items-start gap-2 px-1">
            <ShieldCheck className="size-4 text-primary flex-shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              <strong className="font-semibold text-foreground">Zero-Knowledge:</strong> Your password never leaves this browser.
            </p>
          </div>

          {/* Sign up link */}
          <div className="text-muted-foreground flex justify-center gap-1 text-sm">
            <p>Don&apos;t have an account?</p>
            <Link
              href="/register"
              className="text-primary font-medium hover:underline"
            >
              Create one
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
