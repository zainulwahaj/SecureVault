'use client';

import { useState, type FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Logo } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Spinner } from '@/components/ui/spinner';
import { Lock, ShieldCheck } from 'lucide-react';

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
      <header className="px-6 py-4 flex items-center justify-between">
        <Logo size="sm" />
        <ThemeToggle />
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="mx-auto size-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Lock className="size-8 text-primary" />
            </div>
            <h1 className="text-xl font-semibold text-foreground">Vault Locked</h1>
            <p className="text-sm text-muted-foreground mt-1">Enter your password to unlock</p>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 px-4 py-3 mb-6">
            <Avatar className="size-8">
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{user?.email}</p>
              <p className="text-xs text-muted-foreground">Session active</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                autoFocus
                disabled={isSubmitting}
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

          <div className="mt-6 flex items-start gap-2">
            <ShieldCheck className="size-4 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Zero-Knowledge:</span> Your password never leaves this device.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
