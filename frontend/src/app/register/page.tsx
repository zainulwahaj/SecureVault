'use client';

import { useState, type FormEvent, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { Logo } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import {
  ShieldCheck,
  AlertTriangle,
  Check,
  X,
  AlertCircle,
  Info,
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
    <section className="bg-muted min-h-screen">
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>
      <div className="flex h-full min-h-screen items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="border-muted bg-background flex w-full max-w-sm flex-col items-center gap-y-6 rounded-md border px-6 py-10 shadow-md"
        >
          {/* Logo */}
          <div className="flex flex-col items-center gap-y-2">
            <Link href="/">
              <Logo animated />
            </Link>
            <h1 className="text-2xl font-semibold text-foreground">Create your vault</h1>
            <p className="text-sm text-muted-foreground text-center">Set up your secure encrypted storage</p>
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

            <div className="flex flex-col gap-2">
              <div className="relative">
                <Input
                  type="password"
                  placeholder="Master Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  disabled={isSubmitting}
                  required
                />
              </div>
              {password && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Strength</span>
                    <span className={`font-medium ${passwordStrength.color}`}>
                      {passwordStrength.label}
                    </span>
                  </div>
                  <Progress value={passwordStrength.score} className="h-1.5" />
                </div>
              )}
            </div>

            <div className="relative">
              <Input
                type="password"
                placeholder="Confirm Password"
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
              <p className="text-xs text-destructive -mt-2">Passwords do not match</p>
            )}

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
              disabled={isSubmitting || !!passwordsDontMatch}
              className="mt-2 w-full"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <Spinner className="size-4" />
                  Creating Vault...
                </span>
              ) : (
                'Create Account'
              )}
            </Button>
          </form>

          {/* Warnings */}
          <div className="flex flex-col gap-3 w-full">
            <div className="flex items-start gap-2 px-1">
              <AlertTriangle className="size-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                <strong className="font-semibold text-foreground">Important:</strong> If you forget your password, your data cannot be recovered.
              </p>
            </div>
            <div className="flex items-start gap-2 px-1">
              <ShieldCheck className="size-4 text-primary flex-shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                <strong className="font-semibold text-foreground">Zero-Knowledge:</strong> All encryption happens locally in your browser.
              </p>
            </div>
          </div>

          {/* Login link */}
          <div className="text-muted-foreground flex justify-center gap-1 text-sm">
            <p>Already have an account?</p>
            <Link
              href="/login"
              className="text-primary font-medium hover:underline"
            >
              Sign in
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
