'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import MFAVerification from '@/components/MFAVerification';
import { Logo, LogoLoader } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { ShieldCheck } from 'lucide-react';

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
    <div className="flex min-h-screen">
      <div className="flex flex-1 flex-col justify-center px-6 py-12 lg:px-16 xl:px-24">
        <div className="absolute top-6 left-6">
          <Link href="/">
            <Logo size="sm" />
          </Link>
        </div>

        <div className="mx-auto w-full max-w-sm">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Welcome back
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to access your encrypted vault
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                disabled={isSubmitting}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                disabled={isSubmitting}
                required
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            {status && !error && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner className="size-3" />
                {status}
              </div>
            )}

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-full"
              size="lg"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <Spinner className="size-4" />
                  Authenticating...
                </span>
              ) : (
                'Sign in'
              )}
            </Button>
          </form>

          <div className="mt-6 flex items-start gap-2">
            <ShieldCheck className="size-4 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Zero-Knowledge:</span> Your password never leaves this browser.
            </p>
          </div>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="font-medium text-primary hover:underline">
              Create one
            </Link>
          </p>
        </div>
      </div>

      <div className="relative hidden lg:block lg:flex-1 p-3 pl-0">
        <div className="absolute top-6 right-6 flex items-center gap-2 z-10">
          <ThemeToggle />
          <Link href="/register">
            <Button variant="secondary" className="rounded-full" size="sm">
              Create account
            </Button>
          </Link>
        </div>

        <div className="relative w-full h-full rounded-2xl overflow-hidden">
          <img
            src="/auth-hero.png"
            alt="SecureVault — your files, always encrypted"
            className="absolute inset-0 w-full h-full object-cover object-right"
          />
        </div>
      </div>
    </div>
  );
}
