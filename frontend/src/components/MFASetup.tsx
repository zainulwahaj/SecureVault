'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { setupMFA as setupMFAApi, getMFAStatus, disableMFA } from '@/lib/api';
import { setupMFA, verifyTOTPCode } from '@/lib/crypto';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import {
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
  ClipboardCopy,
  X,
} from 'lucide-react';

interface MFASetupProps {
  onClose?: () => void;
}

type SetupStep = 'initial' | 'stepper' | 'recovery' | 'complete';

export default function MFASetup({ onClose }: MFASetupProps) {
  const { user, vaultKey } = useAuth();
  const [step, setStep] = useState<SetupStep>('initial');
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [mfaSecret, setMfaSecret] = useState<string | null>(null);
  const [encryptedSecret, setEncryptedSecret] = useState<any>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [recoveryCodesHash, setRecoveryCodesHash] = useState<string[]>([]);

  const [disableCode, setDisableCode] = useState('');
  const [showDisable, setShowDisable] = useState(false);

  useEffect(() => {
    checkMFAStatus();
  }, []);

  async function checkMFAStatus() {
    setLoading(true);
    const result = await getMFAStatus();
    if (result.success && result.data) {
      setMfaEnabled(result.data.mfaEnabled);
    }
    setLoading(false);
  }

  async function startSetup() {
    if (!vaultKey || !user) {
      setError('No vault key available. Please log in again.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const result = await setupMFA(user.email, vaultKey);

      if (!result.success || !result.data) {
        setError(result.error || 'Failed to generate MFA secret');
        return;
      }

      const setupData = result.data;
      setQrCodeDataUrl(setupData.qrCodeDataUrl);
      setMfaSecret(setupData.secret);
      setEncryptedSecret(setupData.encryptedSecret);
      setRecoveryCodes(setupData.recoveryCodes);
      setRecoveryCodesHash(setupData.recoveryCodesHash);

      setStep('stepper');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate MFA secret');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(code: string) {
    if (!mfaSecret || !encryptedSecret || code.length !== 6) return;

    setError(null);
    setLoading(true);

    try {
      const isValid = verifyTOTPCode(mfaSecret, code);
      if (!isValid) {
        setError('Invalid verification code. Please try again.');
        setVerificationCode('');
        setLoading(false);
        return;
      }

      const result = await setupMFAApi(encryptedSecret, mfaSecret, recoveryCodesHash, code);
      if (result.success) {
        setStep('recovery');
      } else {
        setError(result.error || 'Failed to enable MFA');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  }

  function completeSetup() {
    setMfaEnabled(true);
    setStep('complete');
    setMfaSecret(null);
    setEncryptedSecret(null);
    setRecoveryCodes([]);
  }

  async function handleDisableMFA() {
    if (disableCode.length !== 6) {
      setError('Please enter a valid 6-digit code');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const result = await disableMFA(disableCode);
      if (result.success) {
        setMfaEnabled(false);
        setShowDisable(false);
        setDisableCode('');
        setStep('initial');
      } else {
        setError(result.error || 'Failed to disable MFA');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disable MFA');
    } finally {
      setLoading(false);
    }
  }

  function copyRecoveryCodes() {
    const codesText = recoveryCodes.join('\n');
    navigator.clipboard.writeText(codesText);
  }

  if (loading && step === 'initial') {
    return (
      <div className="py-8 flex items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (step === 'initial' && mfaEnabled && !showDisable) {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="size-5 text-primary" />
            <div>
              <h3 className="text-base font-semibold text-foreground">Two-Factor Authentication</h3>
              <p className="text-sm text-muted-foreground">Secure your account with 2FA</p>
            </div>
          </div>
        </div>

        <Card className="border-green-500/20">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle className="size-5 text-green-600 dark:text-green-400 shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">2FA Enabled</span>
                <Badge className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20 text-xs">Active</Badge>
              </div>
              <p className="text-sm text-muted-foreground">Your account is protected with two-factor authentication.</p>
            </div>
          </CardContent>
        </Card>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowDisable(true)}
          className="mt-4 text-destructive border-destructive/30 hover:bg-destructive/10"
        >
          Disable 2FA
        </Button>
      </div>
    );
  }

  if (step === 'initial' && showDisable) {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="size-5 text-primary" />
            <div>
              <h3 className="text-base font-semibold text-foreground">Disable 2FA</h3>
              <p className="text-sm text-muted-foreground">Enter your authenticator code to disable</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="hover:opacity-70"><X className="size-4" /></button>
          </div>
        )}

        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 mb-4">
          <AlertTriangle className="size-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            Disabling 2FA will make your account less secure.
          </p>
        </div>

        <div className="flex justify-center mb-4">
          <InputOTP
            maxLength={6}
            value={disableCode}
            onChange={(val) => setDisableCode(val)}
          >
            <InputOTPGroup className="gap-2">
              <InputOTPSlot index={0} className="border rounded-lg" />
              <InputOTPSlot index={1} className="border rounded-lg" />
              <InputOTPSlot index={2} className="border rounded-lg" />
              <InputOTPSlot index={3} className="border rounded-lg" />
              <InputOTPSlot index={4} className="border rounded-lg" />
              <InputOTPSlot index={5} className="border rounded-lg" />
            </InputOTPGroup>
          </InputOTP>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setShowDisable(false); setDisableCode(''); setError(null); }}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDisableMFA}
            disabled={loading || disableCode.length !== 6}
            className="flex-1"
          >
            {loading ? <><Spinner className="size-4 mr-2" /> Disabling...</> : 'Disable 2FA'}
          </Button>
        </div>
      </div>
    );
  }

  if (step === 'recovery') {
    return (
      <Card className="flex w-full max-w-[500px] mx-auto shadow-none flex-col gap-6 p-5 md:p-8">
        <CardHeader className="flex flex-col items-center gap-2 p-0">
          <div className="relative flex size-[68px] shrink-0 items-center justify-center rounded-full backdrop-blur-xl md:size-24 before:absolute before:inset-0 before:rounded-full before:bg-gradient-to-b before:from-amber-500 before:to-transparent before:opacity-10">
            <div className="relative z-10 flex size-12 items-center justify-center rounded-full bg-background dark:bg-muted/80 shadow-xs ring-1 ring-inset ring-border md:size-16">
              <AlertTriangle className="size-6 text-amber-500 md:size-8" />
            </div>
          </div>

          <div className="flex flex-col space-y-1.5 text-center">
            <CardTitle className="md:text-xl font-medium">Save Recovery Codes</CardTitle>
            <CardDescription className="tracking-[-0.006em]">
              Each code can only be used once. You won&apos;t see these again.
            </CardDescription>
          </div>
        </CardHeader>

        <Separator />

        <CardContent className="p-0 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {recoveryCodes.map((code, index) => (
              <code
                key={index}
                className="text-sm font-mono text-foreground bg-muted p-2.5 rounded text-center"
              >
                {code}
              </code>
            ))}
          </div>

          <Button variant="outline" size="sm" onClick={copyRecoveryCodes} className="w-full">
            <ClipboardCopy className="size-4 mr-2" />
            Copy Recovery Codes
          </Button>

          <Button onClick={completeSetup} className="w-full">
            <CheckCircle className="size-4 mr-2" />
            I&apos;ve saved my recovery codes
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (step === 'complete') {
    return (
      <Card className="flex w-full max-w-[500px] mx-auto shadow-none flex-col gap-6 p-5 md:p-8">
        <div className="space-y-4 text-center py-6">
          <div className="mx-auto size-16 rounded-full bg-green-500/10 flex items-center justify-center">
            <CheckCircle className="size-8 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-1">2FA Enabled</h3>
            <p className="text-sm text-muted-foreground">Your account is now protected with two-factor authentication.</p>
          </div>
          {onClose && (
            <Button onClick={onClose} className="w-full">Done</Button>
          )}
        </div>
      </Card>
    );
  }

  const STEPS = [
    {
      title: 'Download app',
      description: 'Download a mobile authentication app like Google Authenticator or Authy.',
    },
    {
      title: 'Scan QR code',
      description: 'Scan this QR code using your authenticator app. This will generate a verification code.',
      content: qrCodeDataUrl ? (
        <div className="space-y-3">
          <div className="inline-block p-2 border rounded-lg bg-white">
            <img src={qrCodeDataUrl} alt="MFA QR Code" className="size-32" />
          </div>
          {mfaSecret && (
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground mb-1.5">Or enter manually:</p>
              <code className="block text-xs font-mono text-foreground break-all bg-muted p-2 rounded">
                {mfaSecret}
              </code>
            </div>
          )}
        </div>
      ) : null,
    },
    {
      title: 'Enter code',
      description: 'Enter the 6-digit verification code from your authenticator app.',
      content: (
        <InputOTP
          maxLength={6}
          value={verificationCode}
          onChange={(val) => {
            setVerificationCode(val);
            if (val.length === 6) handleVerify(val);
          }}
        >
          <InputOTPGroup className="gap-2.5">
            <InputOTPSlot index={0} className="border rounded-lg" />
            <InputOTPSlot index={1} className="border rounded-lg" />
            <InputOTPSlot index={2} className="border rounded-lg" />
            <InputOTPSlot index={3} className="border rounded-lg" />
            <InputOTPSlot index={4} className="border rounded-lg" />
            <InputOTPSlot index={5} className="border rounded-lg" />
          </InputOTPGroup>
        </InputOTP>
      ),
    },
  ];

  return (
    <div>
      {step === 'initial' && !mfaEnabled && (
        <Card className="flex w-full max-w-[500px] mx-auto shadow-none flex-col gap-6 p-5 md:p-8">
          <CardHeader className="flex flex-col items-center gap-2 p-0">
            <div className="relative flex size-[68px] shrink-0 items-center justify-center rounded-full backdrop-blur-xl md:size-24 before:absolute before:inset-0 before:rounded-full before:bg-gradient-to-b before:from-neutral-500 before:to-transparent before:opacity-10">
              <div className="relative z-10 flex size-12 items-center justify-center rounded-full bg-background dark:bg-muted/80 shadow-xs ring-1 ring-inset ring-border md:size-16">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  className="size-6 text-muted-foreground/80 md:size-8"
                >
                  <path
                    fill="currentColor"
                    fillRule="evenodd"
                    d="M3.378 5.082C3 5.62 3 7.22 3 10.417v1.574c0 5.638 4.239 8.375 6.899 9.536c.721.315 1.082.473 2.101.473c1.02 0 1.38-.158 2.101-.473C16.761 20.365 21 17.63 21 11.991v-1.574c0-3.198 0-4.797-.378-5.335c-.377-.537-1.88-1.052-4.887-2.081l-.573-.196C13.595 2.268 12.812 2 12 2s-1.595.268-3.162.805L8.265 3c-3.007 1.03-4.51 1.545-4.887 2.082M13.5 15a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1.401A2.999 2.999 0 0 1 12 8a3 3 0 0 1 1.5 5.599z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            </div>

            <div className="flex flex-col space-y-1.5 text-center">
              <CardTitle className="md:text-xl font-medium">
                Enable Two-Factor Authentication
              </CardTitle>
              <CardDescription className="tracking-[-0.006em]">
                Secure your account with an additional layer of protection.
              </CardDescription>
            </div>
          </CardHeader>

          <Separator />

          <CardContent className="p-0">
            <p className="text-sm text-muted-foreground mb-4">
              Your 2FA secret is encrypted with your VaultKey before being stored. The server never sees your actual TOTP secret.
            </p>
            <Button onClick={startSetup} disabled={loading} className="w-full">
              {loading ? <><Spinner className="size-4 mr-2" /> Setting up...</> : 'Get Started'}
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 'stepper' && (
        <Card className="flex w-full max-w-[500px] mx-auto shadow-none flex-col gap-6 p-5 md:p-8">
          <CardHeader className="flex flex-col items-center gap-2 p-0">
            <div className="relative flex size-[68px] shrink-0 items-center justify-center rounded-full backdrop-blur-xl md:size-24 before:absolute before:inset-0 before:rounded-full before:bg-gradient-to-b before:from-neutral-500 before:to-transparent before:opacity-10">
              <div className="relative z-10 flex size-12 items-center justify-center rounded-full bg-background dark:bg-muted/80 shadow-xs ring-1 ring-inset ring-border md:size-16">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  className="size-6 text-muted-foreground/80 md:size-8"
                >
                  <path
                    fill="currentColor"
                    fillRule="evenodd"
                    d="M3.378 5.082C3 5.62 3 7.22 3 10.417v1.574c0 5.638 4.239 8.375 6.899 9.536c.721.315 1.082.473 2.101.473c1.02 0 1.38-.158 2.101-.473C16.761 20.365 21 17.63 21 11.991v-1.574c0-3.198 0-4.797-.378-5.335c-.377-.537-1.88-1.052-4.887-2.081l-.573-.196C13.595 2.268 12.812 2 12 2s-1.595.268-3.162.805L8.265 3c-3.007 1.03-4.51 1.545-4.887 2.082M13.5 15a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1.401A2.999 2.999 0 0 1 12 8a3 3 0 0 1 1.5 5.599z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            </div>

            <div className="flex flex-col space-y-1.5 text-center">
              <CardTitle className="md:text-xl font-medium">
                Enable Two-Factor Authentication
              </CardTitle>
              <CardDescription className="tracking-[-0.006em]">
                Secure your account with an additional layer of protection.
              </CardDescription>
            </div>
          </CardHeader>

          <Separator />

          {error && (
            <div className="flex items-center justify-between rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="hover:opacity-70"><X className="size-4" /></button>
            </div>
          )}

          <CardContent className="p-0">
            <div className="grid items-start justify-start grid-cols-1">
              {STEPS.map((stepItem, index) => (
                <div
                  key={index}
                  className={cn(
                    'relative flex flex-row items-start gap-3 last:after:hidden after:absolute after:top-9 after:bottom-2 after:start-3.5 after:w-px after:-translate-x-[0.5px] after:bg-border',
                    index !== STEPS.length - 1 && 'pb-6'
                  )}
                >
                  <div className="flex flex-col items-center self-stretch">
                    <span className="z-10 text-xs font-semibold flex shrink-0 items-center justify-center rounded-full bg-muted ring-1 ring-inset ring-border text-foreground size-7">
                      {index + 1}
                    </span>
                  </div>
                  <div className="flex flex-col items-start">
                    <p className="text-sm leading-5 tracking-[-0.006em] font-semibold text-foreground">
                      {stepItem.title}
                    </p>
                    <p className="text-sm leading-5 tracking-[-0.006em] text-muted-foreground">
                      {stepItem.description}
                    </p>
                    {stepItem.content && (
                      <div className="mt-2.5">{stepItem.content}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>

          {loading && (
            <div className="flex justify-center">
              <Spinner className="size-5" />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
