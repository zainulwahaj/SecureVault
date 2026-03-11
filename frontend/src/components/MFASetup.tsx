'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { setupMFA as setupMFAApi, getMFAStatus, disableMFA } from '@/lib/api';
import { setupMFA, verifyTOTPCode } from '@/lib/crypto';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import {
  ShieldCheck,
  Smartphone,
  Key,
  CheckCircle,
  AlertTriangle,
  ClipboardCopy,
  X,
  ArrowLeft,
  AlertCircle,
} from 'lucide-react';

interface MFASetupProps {
  onClose?: () => void;
}

type SetupStep = 'initial' | 'qrcode' | 'verify' | 'recovery' | 'complete';

export default function MFASetup({ onClose }: MFASetupProps) {
  const { user, vaultKey } = useAuth();
  const [step, setStep] = useState<SetupStep>('initial');
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Setup state
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [mfaSecret, setMfaSecret] = useState<string | null>(null);
  const [encryptedSecret, setEncryptedSecret] = useState<any>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [recoveryCodesHash, setRecoveryCodesHash] = useState<string[]>([]);

  // Disable state
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

      setStep('qrcode');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate MFA secret');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    if (!mfaSecret || !encryptedSecret || verificationCode.length !== 6) {
      setError('Please enter a valid 6-digit code');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const isValid = verifyTOTPCode(mfaSecret, verificationCode);
      if (!isValid) {
        setError('Invalid verification code. Please try again.');
        setLoading(false);
        return;
      }

      const result = await setupMFAApi(encryptedSecret, recoveryCodesHash, verificationCode);

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
      <div className="p-8 flex items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="size-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">
              Two-Factor Authentication
            </h2>
            <p className="text-sm text-muted-foreground">
              Secure your account with 2FA
            </p>
          </div>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="size-5" />
          </Button>
        )}
      </div>

      {/* Error display */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-4"
          >
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription className="flex items-center justify-between">
                {error}
                <button onClick={() => setError(null)} className="ml-2 hover:opacity-70">
                  <X className="size-4" />
                </button>
              </AlertDescription>
            </Alert>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Initial State - MFA Disabled */}
      {step === 'initial' && !mfaEnabled && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-6"
        >
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Key className="size-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-foreground mb-1">
                    Zero-Knowledge 2FA
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Your 2FA secret is encrypted with your VaultKey before being stored.
                    The server never sees your actual TOTP secret.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            {['Scan QR code with authenticator app', 'Enter verification code', 'Save recovery codes'].map((text, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-muted">
                <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">{i + 1}</div>
                <p className="text-sm text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>

          <Button
            onClick={startSetup}
            disabled={loading}
            className="w-full"
            size="lg"
          >
            {loading ? <><Spinner className="size-4 mr-2" /> Setting up…</> : <><Smartphone className="size-5 mr-2" /> Enable Two-Factor Authentication</>}
          </Button>
        </motion.div>
      )}

      {/* Initial State - MFA Enabled */}
      {step === 'initial' && mfaEnabled && !showDisable && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-6"
        >
          <Card className="bg-green-500/5 border-green-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="size-12 rounded-xl bg-green-500/10 flex items-center justify-center">
                  <CheckCircle className="size-7 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-foreground">
                      2FA Enabled
                    </h3>
                    <Badge className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20">Active</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Your account is protected with two-factor authentication.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Button
            variant="outline"
            onClick={() => setShowDisable(true)}
            className="w-full border-destructive/30 text-destructive hover:bg-destructive/10"
          >
            Disable Two-Factor Authentication
          </Button>
        </motion.div>
      )}

      {/* Disable MFA */}
      {step === 'initial' && showDisable && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-6"
        >
          <Alert>
            <AlertTriangle className="size-4" />
            <AlertDescription>
              <strong>Warning:</strong> Disabling 2FA will make your account less secure.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label>Enter your current 2FA code to disable</Label>
            <Input
              type="text"
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="text-center text-2xl tracking-[0.5em] font-mono"
              maxLength={6}
            />
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setShowDisable(false);
                setDisableCode('');
                setError(null);
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDisableMFA}
              disabled={loading || disableCode.length !== 6}
              className="flex-1"
            >
              {loading ? <><Spinner className="size-4 mr-2" /> Disabling…</> : 'Disable 2FA'}
            </Button>
          </div>
        </motion.div>
      )}

      {/* QR Code Step */}
      {step === 'qrcode' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-6"
        >
          <p className="text-muted-foreground">
            Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
          </p>

          {qrCodeDataUrl && (
            <div className="flex justify-center p-6 bg-white rounded-2xl shadow-sm">
              <img src={qrCodeDataUrl} alt="MFA QR Code" className="w-48 h-48" />
            </div>
          )}

          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-2">
                Or enter this code manually:
              </p>
              <code className="block text-sm font-mono text-foreground break-all bg-muted p-3 rounded-lg">
                {mfaSecret}
              </code>
            </CardContent>
          </Card>

          <Button
            onClick={() => setStep('verify')}
            className="w-full"
            size="lg"
          >
            I&apos;ve scanned the code
          </Button>
        </motion.div>
      )}

      {/* Verify Step */}
      {step === 'verify' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-6"
        >
          <p className="text-muted-foreground">
            Enter the 6-digit code from your authenticator app to verify setup:
          </p>

          <Input
            type="text"
            value={verificationCode}
            onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            className="text-center text-3xl tracking-[0.5em] font-mono py-4"
            maxLength={6}
            autoFocus
          />

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setStep('qrcode')}
              className="flex-1"
            >
              <ArrowLeft className="size-4 mr-1" />
              Back
            </Button>
            <Button
              onClick={handleVerify}
              disabled={loading || verificationCode.length !== 6}
              className="flex-1"
            >
              {loading ? <><Spinner className="size-4 mr-2" /> Verifying…</> : 'Verify'}
            </Button>
          </div>
        </motion.div>
      )}

      {/* Recovery Codes Step */}
      {step === 'recovery' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-6"
        >
          <Alert>
            <AlertTriangle className="size-4" />
            <AlertDescription>
              <strong>Save these recovery codes!</strong> Each code can only be used once. You won&apos;t be able to see these again.
            </AlertDescription>
          </Alert>

          <div className="bg-muted p-4 rounded-xl">
            <div className="grid grid-cols-2 gap-2">
              {recoveryCodes.map((code, index) => (
                <code
                  key={index}
                  className="text-sm font-mono text-foreground bg-background p-3 rounded-lg text-center"
                >
                  {code}
                </code>
              ))}
            </div>
          </div>

          <Button
            variant="outline"
            onClick={copyRecoveryCodes}
            className="w-full"
          >
            <ClipboardCopy className="size-5 mr-2" />
            Copy Recovery Codes
          </Button>

          <Button
            onClick={completeSetup}
            className="w-full bg-green-600 hover:bg-green-700 text-white"
            size="lg"
          >
            <CheckCircle className="size-5 mr-2" />
            I&apos;ve saved my recovery codes
          </Button>
        </motion.div>
      )}

      {/* Complete Step */}
      {step === 'complete' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="space-y-6 text-center py-4"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            className="mx-auto size-20 rounded-full bg-green-500/10 flex items-center justify-center"
          >
            <CheckCircle className="size-10 text-green-600 dark:text-green-400" />
          </motion.div>

          <div>
            <h3 className="text-xl font-semibold text-foreground mb-2">
              Two-Factor Authentication Enabled!
            </h3>
            <p className="text-muted-foreground">
              Your account is now protected with an additional layer of security.
            </p>
          </div>

          {onClose && (
            <Button onClick={onClose} className="w-full" size="lg">
              Done
            </Button>
          )}
        </motion.div>
      )}
    </div>
  );
}
