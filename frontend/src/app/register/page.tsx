'use client';

import { useState, useMemo, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { CipherLabAuthShell } from '@/components/auth/CipherLabAuthShell';
import { FormCard } from '@/components/auth/FormCard';
import { AuthField } from '@/components/auth/AuthField';
import { PasswordStrengthPanel } from '@/components/auth/PasswordStrengthPanel';
import { CalloutLine } from '@/components/auth/CalloutLine';
import { evaluatePassword } from '@/lib/auth/passwordStrength';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register } = useAuth();
  const router = useRouter();

  const ev = useMemo(() => evaluatePassword(password), [password]);
  const matchErr = confirm && confirm !== password ? 'Passwords do not match' : '';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setStatus('');

    if (!email || !password || !confirm) {
      setError('Please fill in all fields');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setIsSubmitting(true);
    setStatus('Generating encryption keys…');

    try {
      const result = await register(email, password);
      if (result.success) {
        setStatus('Success — redirecting…');
        router.push('/dashboard');
      } else {
        setError(result.error || 'Registration failed');
        setStatus('');
      }
    } catch {
      setError('An unexpected error occurred');
      setStatus('');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <CipherLabAuthShell mode="register">
      <FormCard
        eyebrow="§ AUTH · 02_CREATE_VAULT"
        titleLeft="Forge your"
        italicWord=" vault"
        subtitle="Sixty seconds, one password, no recovery email. Your password is the only key — choose well."
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
              placeholder="choose a long, memorable phrase"
              autoComplete="new-password"
              disabled={isSubmitting}
              monoLabel
              monoValue
              showToggle
              toggled={showPw}
              onToggle={() => setShowPw(!showPw)}
              required
            />
            <PasswordStrengthPanel password={password} ev={ev} />
          </div>

          <AuthField
            id="confirm"
            label="Confirm password"
            type="password"
            value={confirm}
            onChange={setConfirm}
            placeholder="type it again"
            autoComplete="new-password"
            disabled={isSubmitting}
            monoLabel
            monoValue
            error={matchErr}
            hint={
              confirm && !matchErr ? (
                <span className="text-emerald-500">✓ matches</span>
              ) : null
            }
            required
          />

          {error ? (
            <p className="font-mono text-[12px] text-destructive">! {error}</p>
          ) : null}

          {status && !error ? (
            <p className="font-mono text-[12px] text-muted-foreground">⟳ {status}</p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting || !!matchErr}
            className="a-cta mt-1.5 flex h-[52px] cursor-pointer items-center justify-center gap-2.5 rounded-xl bg-primary text-[15px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
            style={{
              boxShadow: '0 8px 28px oklch(from var(--primary) l c h / 0.35)',
              border: 'none',
            }}
          >
            {isSubmitting ? 'Creating vault…' : 'Create encrypted vault'}
            {!isSubmitting && <ArrowRight size={16} />}
          </button>
        </form>

        <div className="mt-6 grid gap-2.5">
          <CalloutLine icon={<ShieldCheck size={16} />}>
            <b className="text-foreground">Zero-knowledge:</b> all encryption happens in this
            browser.
          </CalloutLine>
          <CalloutLine icon={<X size={16} />} tone="danger">
            <b className="text-foreground">No recovery:</b> forget your password and your
            data is gone forever.
          </CalloutLine>
        </div>

        <p className="mt-6 text-center text-[14px] text-muted-foreground">
          Already have a vault?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in →
          </Link>
        </p>
      </FormCard>
    </CipherLabAuthShell>
  );
}
