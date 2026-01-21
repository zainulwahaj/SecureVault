'use client';

/**
 * Login Page - Zero-Knowledge Authentication
 * 
 * SECURITY:
 * 1. Password entered here NEVER leaves the browser
 * 2. Password is used to derive KEK (Key Encryption Key)
 * 3. KEK decrypts VaultKey (proves password is correct)
 * 4. Backend only receives proof of successful decryption
 * 5. MFA verification happens client-side (zero-knowledge TOTP)
 */

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import MFAVerification from '@/components/MFAVerification';
import { Logo, LogoLoader } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { EnvelopeIcon, LockClosedIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState('');
  
  const { login, user, isAuthenticated, needsUnlock, isLoading, pendingMfa, vaultKey, completeMfaVerification, cancelMfaVerification } = useAuth();
  const router = useRouter();

  // Redirect if already authenticated
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, isLoading, router]);

  // Redirect if has session but no MFA pending (use unlock instead)
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
      // Validate inputs
      if (!email || !password) {
        setError('Please fill in all fields');
        return;
      }

      if (password.length < 8) {
        setError('Password must be at least 8 characters');
        return;
      }

      // Show progress (crypto can take a moment)
      setStatus('Deriving encryption keys...');
      
      /**
       * ZERO-KNOWLEDGE LOGIN:
       * 1. Fetch encrypted data from backend
       * 2. Derive KEK from password (client-side)
       * 3. Decrypt VaultKey (client-side)
       * 4. Send proof to backend (never password)
       * 5. Check if MFA is required
       */
      const result = await login(email, password);
      
      if (result.success) {
        if (result.requiresMfa) {
          // MFA required - show MFA verification
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
  
  // Show loading while checking auth state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <LogoLoader />
      </div>
    );
  }

  // Show MFA verification if needed
  if (pendingMfa && vaultKey) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <MFAVerification
          vaultKey={vaultKey}
          onSuccess={handleMfaSuccess}
          onCancel={cancelMfaVerification}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <header className="px-4 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/">
            <Logo animated />
          </Link>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <Card variant="elevated" className="overflow-hidden">
            <CardHeader className="text-center pb-2">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center mb-4 shadow-glow"
              >
                <LockClosedIcon className="w-8 h-8 text-white" />
              </motion.div>
              <CardTitle className="text-2xl">Welcome Back</CardTitle>
              <CardDescription>Sign in to access your encrypted vault</CardDescription>
            </CardHeader>

            <CardContent className="pt-4">
              <form onSubmit={handleSubmit} className="space-y-5">
                <Input
                  id="email"
                  type="email"
                  label="Email Address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  disabled={isSubmitting}
                  leftIcon={<EnvelopeIcon className="w-5 h-5" />}
                />

                <Input
                  id="password"
                  type="password"
                  label="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  disabled={isSubmitting}
                  leftIcon={<LockClosedIcon className="w-5 h-5" />}
                />

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <Alert variant="error" onClose={() => setError('')}>
                      {error}
                    </Alert>
                  </motion.div>
                )}

                {status && !error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <Alert variant="info">
                      {status}
                    </Alert>
                  </motion.div>
                )}

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  loading={isSubmitting}
                  className="w-full"
                  size="lg"
                >
                  {isSubmitting ? 'Authenticating...' : 'Sign In'}
                </Button>
              </form>

              <div className="mt-6 p-4 rounded-xl bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800">
                <div className="flex items-start gap-3">
                  <ShieldCheckIcon className="w-5 h-5 text-primary-600 dark:text-primary-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-primary-700 dark:text-primary-300">
                    <strong className="font-semibold">Zero-Knowledge:</strong> Your password never leaves this browser. 
                    Authentication is proven cryptographically.
                  </p>
                </div>
              </div>

              <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
                Don&apos;t have an account?{' '}
                <Link 
                  href="/register" 
                  className="font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 transition-colors"
                >
                  Create one
                </Link>
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  );
}
