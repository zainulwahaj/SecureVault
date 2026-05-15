'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Fingerprint, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import MFAVerification from '@/components/MFAVerification';
import { LogoLoader } from '@/components/ui/Logo';
import { CipherLabAuthShell } from '@/components/auth/CipherLabAuthShell';
import { FormCard } from '@/components/auth/FormCard';
import { AuthField } from '@/components/auth/AuthField';
import { KDFInline } from '@/components/auth/KDFInline';
import { cn } from '@/lib/utils';

type Stage = 0 | 1 | 2 | 3;

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [stage, setStage] = useState<Stage>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    login,
    user,
    isAuthenticated,
    isLoading,
    pendingMfa,
    vaultKey,
    completeMfaVerification,
    cancelMfaVerification,
  } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) router.push('/dashboard');
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (!isLoading && user && !pendingMfa) router.push('/dashboard');
  }, [user, isLoading, pendingMfa, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsSubmitting(true);
    setStage(1);

    const deriveTimer = window.setTimeout(() => setStage(2), 900);

    try {
      const result = await login(email, password);
      window.clearTimeout(deriveTimer);

      if (result.success) {
        setStage(3);
        if (!result.requiresMfa) {
          window.setTimeout(() => router.push('/dashboard'), 600);
        }
      } else {
        setStage(0);
        setError(result.error || 'Login failed');
      }
    } catch {
      window.clearTimeout(deriveTimer);
      setStage(0);
      setError('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleMfaSuccess() {
    completeMfaVerification();
    router.push('/dashboard');
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <LogoLoader />
      </div>
    );
  }

  if (pendingMfa && vaultKey) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <MFAVerification
          vaultKey={vaultKey}
          onSuccess={handleMfaSuccess}
          onCancel={cancelMfaVerification}
        />
      </div>
    );
  }

  return (
    <CipherLabAuthShell mode="login">
      <FormCard
        eyebrow="§ AUTH · 01_SIGN_IN"
        titleLeft="Welcome"
        italicWord=" back"
        subtitle="Sign in to unlock your encrypted vault. Your password derives the key locally — we never see it."
      >
        <form onSubmit={handleSubmit} className="grid gap-4">
          <AuthField
            id="email"
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            autoComplete="email"
            autoFocus
            disabled={isSubmitting}
            monoLabel
            required
          />

          <div>
            <AuthField
              id="password"
              label="Master password"
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={setPassword}
              placeholder="enter your master password"
              autoComplete="current-password"
              disabled={isSubmitting}
              monoLabel
              monoValue
              showToggle
              toggled={showPw}
              onToggle={() => setShowPw(!showPw)}
              hint={
                <Link href="/recover" className="text-primary no-underline hover:underline">
                  forgot?
                </Link>
              }
              required
            />
            <KDFInline password={password} active={stage >= 1} />
          </div>

          {error ? (
            <p className="font-mono text-[12px] text-destructive">! {error}</p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className={cn(
              'a-cta mt-1.5 flex h-[52px] items-center justify-center gap-2.5 rounded-xl text-[15px] font-semibold text-white',
              stage === 3 ? 'bg-emerald-500' : 'bg-primary',
              isSubmitting ? 'cursor-progress' : 'cursor-pointer',
            )}
            style={{
              boxShadow: '0 8px 28px oklch(from var(--primary) l c h / 0.35)',
              border: 'none',
            }}
          >
            {stage === 0 && (
              <>
                Unlock vault <ArrowRight size={16} />
              </>
            )}
            {stage === 1 && <>Deriving key (PBKDF2 · 100k)…</>}
            {stage === 2 && <>Decrypting metadata…</>}
            {stage === 3 && <>✓ Vault unlocked</>}
          </button>

          <div className="my-2 grid grid-cols-[1fr_auto_1fr] items-center gap-3.5">
            <span className="h-px bg-border" />
            <span className="font-mono text-[11px] tracking-[0.1em] text-muted-foreground/70">
              OR
            </span>
            <span className="h-px bg-border" />
          </div>

          <button
            type="button"
            className="flex h-12 items-center justify-center gap-2.5 rounded-xl border border-border bg-foreground/[0.03] text-[14px] font-medium text-foreground transition-colors hover:bg-foreground/[0.06]"
          >
            <Fingerprint size={16} /> Sign in with passkey
          </button>
        </form>

        <div className="mt-7 flex items-start gap-3 rounded-xl border border-border bg-foreground/[0.03] px-4 py-3.5">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary" />
          <div className="text-[13px] leading-[1.5] text-muted-foreground">
            <span className="font-medium text-foreground">Zero-knowledge.</span> Your password
            never leaves this device. If you forget it, no one — including us — can recover
            your files.
          </div>
        </div>

        <p className="mt-6 text-center text-[14px] text-muted-foreground">
          New to SecureVault?{' '}
          <Link href="/register" className="font-medium text-primary hover:underline">
            Create a vault →
          </Link>
        </p>
      </FormCard>
    </CipherLabAuthShell>
  );
}
