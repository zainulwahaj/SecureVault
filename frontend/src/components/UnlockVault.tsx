'use client';

import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { Logo } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Spinner } from '@/components/ui/spinner';
import { Lock, ShieldCheck, AlertCircle, Info } from 'lucide-react';

interface UnlockVaultProps {
  onUnlocked?: () => void;
}

export default function UnlockVault({ onUnlocked }: UnlockVaultProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState('');

  const { user, unlock, logout } = useAuth();

  const initials = (user?.email || '')
    .split('@')[0]
    .slice(0, 2)
    .toUpperCase();

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
    <div className="min-h-screen flex flex-col bg-background">
      <header className="px-4 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Logo animated />
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <Card>
            <CardHeader className="text-center pb-2">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                className="mx-auto size-20 rounded-full bg-amber-500 flex items-center justify-center mb-4 shadow-lg ring-4 ring-amber-500/20"
              >
                <Lock className="size-10 text-white" />
              </motion.div>
              <CardTitle className="text-2xl">Vault Locked</CardTitle>
              <CardDescription>Enter your password to unlock</CardDescription>
            </CardHeader>

            <CardContent className="pt-4">
              {/* User info */}
              <div className="flex items-center gap-3 p-4 mb-6 rounded-xl bg-muted border border-border">
                <Avatar className="size-10">
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{user?.email}</p>
                  <p className="text-xs text-muted-foreground">Session active</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      autoFocus
                      disabled={isSubmitting}
                      className="pl-10"
                    />
                  </div>
                </div>

                {error && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                    <Alert variant="destructive">
                      <AlertCircle className="size-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  </motion.div>
                )}

                {status && !error && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                    <Alert>
                      <Info className="size-4" />
                      <AlertDescription className="flex items-center gap-2">
                        <Spinner className="size-3" />
                        {status}
                      </AlertDescription>
                    </Alert>
                  </motion.div>
                )}

                <Button type="submit" disabled={isSubmitting} className="w-full" size="lg">
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <Spinner className="size-4" />
                      Unlocking...
                    </span>
                  ) : (
                    'Unlock Vault'
                  )}
                </Button>
              </form>

              <div className="mt-6 text-center">
                <button
                  onClick={handleLogout}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Sign in with a different account
                </button>
              </div>

              <div className="mt-6 p-4 rounded-xl bg-primary/5 border border-primary/10">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="size-5 text-primary flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    <strong className="font-semibold text-foreground">Zero-Knowledge:</strong> Your password never leaves this device.
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
