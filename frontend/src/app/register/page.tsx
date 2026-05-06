'use client';

import { useState, type FormEvent, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { Logo } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import {
  ShieldCheck,
  AlertTriangle,
  Check,
  X,
} from 'lucide-react';

function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  if (score <= 1) return { score: 20, label: 'Weak', color: 'text-red-500' };
  if (score === 2) return { score: 40, label: 'Fair', color: 'text-amber-500' };
  if (score === 3) return { score: 60, label: 'Good', color: 'text-blue-500' };
  if (score === 4) return { score: 80, label: 'Strong', color: 'text-green-500' };
  return { score: 100, label: 'Excellent', color: 'text-green-500' };
}

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register } = useAuth();
  const router = useRouter();

  const passwordStrength = useMemo(() => getPasswordStrength(password), [password]);
  const passwordsMatch = password && confirmPassword && password === confirmPassword;
  const passwordsDontMatch = password && confirmPassword && password !== confirmPassword;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setStatus('');
    setIsSubmitting(true);

    try {
      if (!email || !password || !confirmPassword) {
        setError('Please fill in all fields');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        setError('Please enter a valid email address');
        return;
      }

      setStatus('Generating encryption keys...');

      const result = await register(email, password);

      if (result.success) {
        setStatus('Success! Redirecting...');
        router.push('/dashboard');
      } else {
        setError(result.error || 'Registration failed');
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
      setStatus('');
    }
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
            Create your vault
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Set up your secure encrypted storage
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
              <Label htmlFor="password">Master Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Create a strong password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                disabled={isSubmitting}
                required
              />
              {password && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Strength</span>
                    <span className={`font-medium ${passwordStrength.color}`}>
                      {passwordStrength.label}
                    </span>
                  </div>
                  <Progress value={passwordStrength.score} className="h-1" />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirm"
                  type="password"
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  disabled={isSubmitting}
                  required
                />
                {passwordsMatch && (
                  <Check className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-green-500" />
                )}
                {passwordsDontMatch && (
                  <X className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-red-500" />
                )}
              </div>
              {passwordsDontMatch && (
                <p className="text-xs text-destructive">Passwords do not match</p>
              )}
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
              disabled={isSubmitting || !!passwordsDontMatch}
              className="w-full rounded-full"
              size="lg"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <Spinner className="size-4" />
                  Creating Vault...
                </span>
              ) : (
                'Create account'
              )}
            </Button>
          </form>

          <div className="mt-6 space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="size-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Important:</span> If you forget your password, your data cannot be recovered.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <ShieldCheck className="size-4 text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Zero-Knowledge:</span> All encryption happens locally in your browser.
              </p>
            </div>
          </div>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>

      <div className="relative hidden lg:block lg:flex-1 p-3 pl-0">
        <div className="absolute top-6 right-6 flex items-center gap-2 z-10">
          <ThemeToggle />
          <Link href="/login">
            <Button variant="secondary" className="rounded-full" size="sm">
              Log in
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
