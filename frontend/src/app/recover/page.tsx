'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, KeyRound, ShieldAlert } from 'lucide-react';
import { CipherLabAuthShell } from '@/components/auth/CipherLabAuthShell';
import { FormCard } from '@/components/auth/FormCard';
import { AuthField } from '@/components/auth/AuthField';
import { PasswordStrengthPanel } from '@/components/auth/PasswordStrengthPanel';
import { evaluatePassword } from '@/lib/auth/passwordStrength';
import * as api from '@/lib/api';
import { unwrapVaultKeyWithRecovery } from '@/lib/crypto/recovery';
import { base64ToBytes, bytesToBase64, generateSalt } from '@/lib/crypto/kdf';
import { deriveKEK } from '@/lib/crypto/kdf';
import { encryptVaultKey } from '@/lib/crypto/encryption';
import { signLoginChallenge } from '@/lib/crypto/authkey';
import { DEFAULT_KDF_PARAMS, type EncryptedBlob, type KdfParams } from '@/lib/crypto/types';

type Stage = 'enterEmail' | 'enterRecovery' | 'completed';

export default function RecoveryPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('enterEmail');
  const [email, setEmail] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<api.RecoveryChallengePayload | null>(null);

  const ev = evaluatePassword(newPassword);

  async function fetchChallenge(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.getRecoveryChallenge(email.trim().toLowerCase());
      if (!res.success || !res.data) {
        setError(res.error || 'Recovery unavailable for this account');
        return;
      }
      setChallenge(res.data);
      setStage('enterRecovery');
    } finally {
      setBusy(false);
    }
  }

  async function submitReset(e: FormEvent) {
    e.preventDefault();
    if (!challenge) return;
    setError(null);
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (ev.score < 2) {
      setError('Choose a stronger password');
      return;
    }
    setBusy(true);
    try {
      const recoverySaltBytes = base64ToBytes(challenge.recoverySalt);
      const unwrapped = await unwrapVaultKeyWithRecovery(
        recoveryKey,
        recoverySaltBytes,
        challenge.recoveryKdfParams as KdfParams,
        challenge.encryptedVaultKeyRecovery as EncryptedBlob,
      );
      if (!unwrapped.success || !unwrapped.data) {
        setError(unwrapped.error || 'Recovery key did not unlock the vault');
        return;
      }
      const vaultKey = unwrapped.data;

      // Sign the server challenge to prove possession.
      // We need the encryptedAuthPrivateKey — fetch it from the login challenge.
      const loginChallenge = await api.getLoginChallenge(challenge.email);
      if (!loginChallenge.success || !loginChallenge.data?.encryptedAuthPrivateKey) {
        setError('Could not load auth key for signing');
        return;
      }
      const signed = await signLoginChallenge(
        challenge.recoveryChallenge,
        loginChallenge.data.encryptedAuthPrivateKey,
        vaultKey,
      );
      if (!signed.success || !signed.data) {
        setError(signed.error || 'Could not sign recovery challenge');
        return;
      }

      // Derive the new KEK and re-wrap the VaultKey under it.
      const newSalt = generateSalt();
      const newKekResult = await deriveKEK(newPassword, newSalt, DEFAULT_KDF_PARAMS);
      if (!newKekResult.success || !newKekResult.data) {
        setError(newKekResult.error || 'Could not derive new KEK');
        return;
      }
      const newEncryptedVaultKey = await encryptVaultKey(vaultKey, newKekResult.data);
      if (!newEncryptedVaultKey.success || !newEncryptedVaultKey.data) {
        setError(newEncryptedVaultKey.error || 'Could not wrap VaultKey');
        return;
      }

      // VaultKey is unchanged so loginProof stays the same.
      const proofBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', vaultKey as BufferSource));
      const newLoginProof = Array.from(proofBytes)
        .map((b: number) => b.toString(16).padStart(2, '0'))
        .join('');

      const reset = await api.submitRecoveryReset({
        email: challenge.email,
        recoveryChallengeId: challenge.recoveryChallengeId,
        signature: signed.data,
        newSalt: bytesToBase64(newSalt),
        newKdfParams: DEFAULT_KDF_PARAMS,
        newEncryptedVaultKey: {
          ciphertext: newEncryptedVaultKey.data.ciphertext,
          algorithm: newEncryptedVaultKey.data.algorithm,
          version: newEncryptedVaultKey.data.version,
        },
        newLoginProof,
        newEncryptedAuthPrivateKey: {
          ciphertext: loginChallenge.data.encryptedAuthPrivateKey.ciphertext,
          algorithm: loginChallenge.data.encryptedAuthPrivateKey.algorithm,
          version: loginChallenge.data.encryptedAuthPrivateKey.version,
        },
      });
      if (!reset.success) {
        setError(reset.error || 'Recovery failed');
        return;
      }

      setStage('completed');
      setTimeout(() => router.push('/login'), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recovery failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <CipherLabAuthShell mode="login">
      {stage === 'enterEmail' && (
        <FormCard
          eyebrow="§ AUTH · 03_RECOVERY"
          titleLeft="Use your"
          italicWord=" recovery"
          subtitle="Provide your account email so we can fetch the recovery payload your browser will unwrap locally."
        >
          <form onSubmit={fetchChallenge} className="grid gap-4">
            <AuthField
              id="email"
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              autoComplete="email"
              autoFocus
              monoLabel
              required
            />
            {error && <p className="font-mono text-[12px] text-destructive">! {error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="a-cta mt-1.5 flex h-[52px] cursor-pointer items-center justify-center gap-2.5 rounded-xl bg-primary text-[15px] font-semibold text-white disabled:opacity-70"
            >
              {busy ? 'Looking up…' : 'Continue'} <ArrowRight size={16} />
            </button>
            <p className="mt-2 text-center text-[14px] text-muted-foreground">
              <Link href="/login" className="text-primary hover:underline">Back to sign in</Link>
            </p>
          </form>
        </FormCard>
      )}

      {stage === 'enterRecovery' && challenge && (
        <FormCard
          eyebrow="§ AUTH · 03_UNWRAP_VAULT"
          titleLeft="Unwrap with"
          italicWord=" recovery key"
          subtitle="Paste the recovery key shown when you enrolled. Your browser will unwrap the vault key locally and set a new password."
        >
          <form onSubmit={submitReset} className="grid gap-4">
            <AuthField
              id="recovery"
              label="Recovery key"
              type="text"
              value={recoveryKey}
              onChange={setRecoveryKey}
              placeholder="XXXX-XXXX-XXXX-..."
              autoFocus
              monoLabel
              monoValue
              required
            />
            <AuthField
              id="new-password"
              label="New password"
              type="password"
              value={newPassword}
              onChange={setNewPassword}
              placeholder="choose a long passphrase"
              autoComplete="new-password"
              monoLabel
              required
            />
            <PasswordStrengthPanel password={newPassword} ev={ev} />
            <AuthField
              id="confirm-password"
              label="Confirm password"
              type="password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder="type it again"
              autoComplete="new-password"
              monoLabel
              required
            />
            {error && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-[12px] text-destructive font-mono">
                <ShieldAlert className="size-3.5 mt-0.5 shrink-0" />
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={busy}
              className="a-cta mt-1.5 flex h-[52px] cursor-pointer items-center justify-center gap-2.5 rounded-xl bg-primary text-[15px] font-semibold text-white disabled:opacity-70"
            >
              {busy ? 'Resetting…' : (
                <>
                  <KeyRound size={16} /> Unlock & set new password
                </>
              )}
            </button>
          </form>
        </FormCard>
      )}

      {stage === 'completed' && (
        <FormCard
          eyebrow="§ AUTH · 04_DONE"
          titleLeft="Vault"
          italicWord=" recovered"
          subtitle="Your password has been rotated and a new session is active. Redirecting…"
        >
          <Link
            href="/dashboard"
            className="a-cta mt-1.5 inline-flex h-[52px] items-center justify-center gap-2.5 rounded-xl bg-primary px-6 text-[15px] font-semibold text-white"
          >
            Continue <ArrowRight size={16} />
          </Link>
        </FormCard>
      )}
    </CipherLabAuthShell>
  );
}
