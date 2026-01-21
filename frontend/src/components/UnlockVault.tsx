'use client';

/**
 * Unlock Vault Component
 * 
 * Shown when user has a valid session but VaultKey is lost (page refresh).
 * User only needs to enter password to unlock - email is already known.
 * 
 * SECURITY:
 * - Password is used locally to derive KEK
 * - KEK decrypts VaultKey (proves password correct)
 * - Password NEVER leaves the browser
 */

import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { Logo } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Avatar } from '@/components/ui/Avatar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { LockClosedIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';

interface UnlockVaultProps {
  onUnlocked?: () => void;
}

export default function UnlockVault({ onUnlocked }: UnlockVaultProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState('');
  
  const { user, unlock, logout } = useAuth();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setStatus('');
    setIsSubmitting(true);

    try {
      if (!password) {
        setError('Please enter your password');
        return;
      }

      setStatus('Unlocking vault...');
      
      const result = await unlock(password);
      
      if (result.success) {
        setStatus('Unlocked!');
        onUnlocked?.();
      } else {
        setError(result.error || 'Incorrect password');
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
      setStatus('');
    }
  }

  async function handleLogout() {
    await logout();
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <header className="px-4 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Logo animated />
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
                className="mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center mb-4 shadow-glow ring-4 ring-amber-100 dark:ring-amber-900/30"
              >
                <LockClosedIcon className="w-10 h-10 text-white" />
              </motion.div>
              <CardTitle className="text-2xl">Vault Locked</CardTitle>
              <CardDescription>
                Enter your password to unlock
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-4">
              {/* User info */}
              <div className="flex items-center gap-3 p-4 mb-6 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <Avatar name={user?.email || ''} size="md" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                    {user?.email}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Session active
                  </p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <Input
                  id="password"
                  type="password"
                  label="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  autoFocus
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
                  {isSubmitting ? 'Unlocking...' : 'Unlock Vault'}
                </Button>
              </form>

              <div className="mt-6 text-center">
                <button
                  onClick={handleLogout}
                  className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
                >
                  Sign in with a different account
                </button>
              </div>

              {/* Security Note */}
              <div className="mt-6 p-4 rounded-xl bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800">
                <div className="flex items-start gap-3">
                  <ShieldCheckIcon className="w-5 h-5 text-primary-600 dark:text-primary-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-primary-700 dark:text-primary-300">
                    <strong className="font-semibold">Zero-Knowledge:</strong> Your password never leaves this device. 
                    It&apos;s used locally to decrypt your vault key.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  );
}
