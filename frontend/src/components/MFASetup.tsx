'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { setupMFA as setupMFAApi, getMFAStatus, disableMFA } from '@/lib/api';
import { setupMFA, verifyTOTPCode } from '@/lib/crypto';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import {
  ShieldCheckIcon,
  DevicePhoneMobileIcon,
  KeyIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ClipboardDocumentIcon,
  XMarkIcon,
  ArrowLeftIcon,
} from '@heroicons/react/24/outline';

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

  // Check current MFA status
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

  // Start MFA setup
  async function startSetup() {
    if (!vaultKey || !user) {
      setError('No vault key available. Please log in again.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      // Generate TOTP secret and encrypt it
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

  // Verify the TOTP code
  async function handleVerify() {
    if (!mfaSecret || !encryptedSecret || verificationCode.length !== 6) {
      setError('Please enter a valid 6-digit code');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      // Verify the code locally first
      const isValid = verifyTOTPCode(mfaSecret, verificationCode);
      if (!isValid) {
        setError('Invalid verification code. Please try again.');
        setLoading(false);
        return;
      }

      // Send to backend
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

  // Complete setup
  function completeSetup() {
    setMfaEnabled(true);
    setStep('complete');
    // Clear sensitive data
    setMfaSecret(null);
    setEncryptedSecret(null);
    setRecoveryCodes([]);
  }

  // Disable MFA
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

  // Copy recovery codes to clipboard
  function copyRecoveryCodes() {
    const codesText = recoveryCodes.join('\n');
    navigator.clipboard.writeText(codesText);
  }

  if (loading && step === 'initial') {
    return (
      <div className="p-8 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
            <ShieldCheckIcon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Two-Factor Authentication
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Secure your account with 2FA
            </p>
          </div>
        </div>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            <XMarkIcon className="w-5 h-5" />
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
            <Alert variant="error" onClose={() => setError(null)}>
              {error}
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
          <Card variant="bordered" className="bg-primary-50/50 dark:bg-primary-900/10 border-primary-200 dark:border-primary-800">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <KeyIcon className="w-5 h-5 text-primary-600 dark:text-primary-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-primary-900 dark:text-primary-100 mb-1">
                    Zero-Knowledge 2FA
                  </h3>
                  <p className="text-sm text-primary-700 dark:text-primary-300">
                    Your 2FA secret is encrypted with your VaultKey before being stored. 
                    The server never sees your actual TOTP secret.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
              <div className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-sm font-semibold text-primary-600">1</div>
              <p className="text-sm text-slate-600 dark:text-slate-300">Scan QR code with authenticator app</p>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
              <div className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-sm font-semibold text-primary-600">2</div>
              <p className="text-sm text-slate-600 dark:text-slate-300">Enter verification code</p>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
              <div className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-sm font-semibold text-primary-600">3</div>
              <p className="text-sm text-slate-600 dark:text-slate-300">Save recovery codes</p>
            </div>
          </div>

          <Button
            onClick={startSetup}
            disabled={loading}
            loading={loading}
            className="w-full"
            size="lg"
          >
            <DevicePhoneMobileIcon className="w-5 h-5" />
            Enable Two-Factor Authentication
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
          <Card variant="bordered" className="bg-success-50/50 dark:bg-success-900/10 border-success-200 dark:border-success-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-success-100 dark:bg-success-900/30 flex items-center justify-center">
                  <CheckCircleIcon className="w-7 h-7 text-success-600 dark:text-success-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-success-900 dark:text-success-100">
                      2FA Enabled
                    </h3>
                    <Badge variant="success" size="sm">Active</Badge>
                  </div>
                  <p className="text-sm text-success-700 dark:text-success-300">
                    Your account is protected with two-factor authentication.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Button
            variant="outline"
            onClick={() => setShowDisable(true)}
            className="w-full border-error-300 text-error-600 hover:bg-error-50 dark:border-error-700 dark:text-error-400 dark:hover:bg-error-900/20"
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
          <Alert variant="warning">
            <strong>Warning:</strong> Disabling 2FA will make your account less secure.
          </Alert>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Enter your current 2FA code to disable
            </label>
            <input
              type="text"
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="w-full px-4 py-4 text-center text-2xl tracking-[0.5em] font-mono border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-error-500 focus:border-error-500 transition-all"
              maxLength={6}
            />
          </div>

          <div className="flex gap-3">
            <Button
              variant="secondary"
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
              variant="danger"
              onClick={handleDisableMFA}
              disabled={loading || disableCode.length !== 6}
              loading={loading}
              className="flex-1"
            >
              Disable 2FA
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
          <p className="text-slate-600 dark:text-slate-300">
            Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
          </p>

          {qrCodeDataUrl && (
            <div className="flex justify-center p-6 bg-white rounded-2xl shadow-soft">
              <img src={qrCodeDataUrl} alt="MFA QR Code" className="w-48 h-48" />
            </div>
          )}

          <Card variant="bordered" className="bg-slate-50 dark:bg-slate-800">
            <CardContent className="p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                Or enter this code manually:
              </p>
              <code className="block text-sm font-mono text-slate-900 dark:text-white break-all bg-white dark:bg-slate-900 p-3 rounded-lg">
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
          <p className="text-slate-600 dark:text-slate-300">
            Enter the 6-digit code from your authenticator app to verify setup:
          </p>

          <input
            type="text"
            value={verificationCode}
            onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            className="w-full px-4 py-4 text-center text-3xl tracking-[0.5em] font-mono border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
            maxLength={6}
            autoFocus
          />

          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => setStep('qrcode')}
              className="flex-1"
            >
              <ArrowLeftIcon className="w-4 h-4" />
              Back
            </Button>
            <Button
              onClick={handleVerify}
              disabled={loading || verificationCode.length !== 6}
              loading={loading}
              className="flex-1"
            >
              Verify
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
          <Alert variant="warning">
            <strong>Save these recovery codes!</strong> Each code can only be used once. You won&apos;t be able to see these again.
          </Alert>

          <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-xl">
            <div className="grid grid-cols-2 gap-2">
              {recoveryCodes.map((code, index) => (
                <code
                  key={index}
                  className="text-sm font-mono text-slate-900 dark:text-white bg-white dark:bg-slate-700 p-3 rounded-lg text-center"
                >
                  {code}
                </code>
              ))}
            </div>
          </div>

          <Button
            variant="secondary"
            onClick={copyRecoveryCodes}
            className="w-full"
          >
            <ClipboardDocumentIcon className="w-5 h-5" />
            Copy Recovery Codes
          </Button>

          <Button
            onClick={completeSetup}
            className="w-full bg-success-600 hover:bg-success-700"
            size="lg"
          >
            <CheckCircleIcon className="w-5 h-5" />
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
            className="mx-auto w-20 h-20 rounded-full bg-success-100 dark:bg-success-900/30 flex items-center justify-center"
          >
            <CheckCircleIcon className="w-10 h-10 text-success-600 dark:text-success-400" />
          </motion.div>

          <div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
              Two-Factor Authentication Enabled!
            </h3>
            <p className="text-slate-600 dark:text-slate-300">
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
