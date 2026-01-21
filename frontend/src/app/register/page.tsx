'use client';

/**
 * Registration Page - Zero-Knowledge Authentication
 * 
 * SECURITY:
 * 1. Generate random salt (client-side)
 * 2. Derive KEK from password + salt (client-side)
 * 3. Generate random VaultKey (client-side)
 * 4. Encrypt VaultKey with KEK (client-side)
 * 5. Send ONLY: email, salt, kdfParams, encryptedVaultKey
 * 6. Password NEVER leaves the browser
 */

import { useState, type FormEvent, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { Logo } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import {
  EnvelopeIcon,
  LockClosedIcon,
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  UserPlusIcon,
  CheckIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

// Password strength checker
function getPasswordStrength(password: string): { score: number; label: string; color: 'error' | 'warning' | 'success' | 'primary' } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  if (score <= 1) return { score: 20, label: 'Weak', color: 'error' };
  if (score === 2) return { score: 40, label: 'Fair', color: 'warning' };
  if (score === 3) return { score: 60, label: 'Good', color: 'primary' };
  if (score === 4) return { score: 80, label: 'Strong', color: 'success' };
  return { score: 100, label: 'Excellent', color: 'success' };
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
      // Validate inputs
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

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        setError('Please enter a valid email address');
        return;
      }

      // Show progress (crypto can take a moment)
      setStatus('Generating encryption keys...');

      /**
       * ZERO-KNOWLEDGE REGISTRATION:
       * 1. Generate salt + VaultKey (random, client-side)
       * 2. Derive KEK from password (client-side PBKDF2)
       * 3. Encrypt VaultKey with KEK (XChaCha20-Poly1305)
       * 4. Send encrypted data to backend (no password!)
       */
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
                <UserPlusIcon className="w-8 h-8 text-white" />
              </motion.div>
              <CardTitle className="text-2xl">Create Your Vault</CardTitle>
              <CardDescription>Set up your secure encrypted storage</CardDescription>
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

                <div className="space-y-2">
                  <Input
                    id="password"
                    type="password"
                    label="Master Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    disabled={isSubmitting}
                    leftIcon={<LockClosedIcon className="w-5 h-5" />}
                  />
                  {password && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500 dark:text-slate-400">Password strength</span>
                        <span className={`font-medium ${
                          passwordStrength.color === 'error' ? 'text-error-500' :
                          passwordStrength.color === 'warning' ? 'text-warning-500' :
                          passwordStrength.color === 'success' ? 'text-success-500' :
                          'text-primary-500'
                        }`}>
                          {passwordStrength.label}
                        </span>
                      </div>
                      <ProgressBar 
                        value={passwordStrength.score} 
                        color={passwordStrength.color}
                        size="sm"
                        animated
                      />
                    </motion.div>
                  )}
                </div>

                <div className="space-y-2">
                  <Input
                    id="confirmPassword"
                    type="password"
                    label="Confirm Password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    disabled={isSubmitting}
                    leftIcon={<LockClosedIcon className="w-5 h-5" />}
                    rightIcon={
                      passwordsMatch ? (
                        <CheckIcon className="w-5 h-5 text-success-500" />
                      ) : passwordsDontMatch ? (
                        <XMarkIcon className="w-5 h-5 text-error-500" />
                      ) : null
                    }
                    error={passwordsDontMatch ? 'Passwords do not match' : undefined}
                  />
                </div>

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
                  disabled={isSubmitting || !!passwordsDontMatch}
                  loading={isSubmitting}
                  className="w-full"
                  size="lg"
                >
                  {isSubmitting ? 'Creating Vault...' : 'Create Account'}
                </Button>
              </form>

              {/* Warning about password */}
              <div className="mt-6 p-4 rounded-xl bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800">
                <div className="flex items-start gap-3">
                  <ExclamationTriangleIcon className="w-5 h-5 text-warning-600 dark:text-warning-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-warning-700 dark:text-warning-300">
                    <strong className="font-semibold">Important:</strong> Your password encrypts your vault key. 
                    We never store or see your password. <strong>If you forget it, your data cannot be recovered.</strong>
                  </p>
                </div>
              </div>

              {/* Zero-knowledge info */}
              <div className="mt-3 p-4 rounded-xl bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800">
                <div className="flex items-start gap-3">
                  <ShieldCheckIcon className="w-5 h-5 text-primary-600 dark:text-primary-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-primary-700 dark:text-primary-300">
                    <strong className="font-semibold">Zero-Knowledge:</strong> Your password never leaves this browser. 
                    All encryption happens locally on your device.
                  </p>
                </div>
              </div>

              <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
                Already have an account?{' '}
                <Link 
                  href="/login" 
                  className="font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 transition-colors"
                >
                  Sign in
                </Link>
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  );
}
