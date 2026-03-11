'use client';

import { useState } from 'react';
import { verifyMFA, getMFASecret } from '@/lib/api';
import { decryptMFASecret, verifyTOTPCode } from '@/lib/crypto';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { Lock, AlertCircle } from 'lucide-react';

interface MFAVerificationProps {
  vaultKey: Uint8Array;
  onSuccess: () => void;
  onCancel?: () => void;
}

export default function MFAVerification({ vaultKey, onSuccess, onCancel }: MFAVerificationProps) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);

  async function handleVerify() {
    if (useRecoveryCode) {
      if (code.length !== 8) {
        setError('Recovery code must be 8 characters');
        return;
      }
    } else {
      if (code.length !== 6) {
        setError('Please enter a valid 6-digit code');
        return;
      }
    }

    setError(null);
    setLoading(true);

    try {
      if (useRecoveryCode) {
        const result = await verifyMFA(code, true);
        if (result.success && result.data?.verified) {
          onSuccess();
        } else {
          setError(result.error || 'Invalid recovery code');
        }
      } else {
        const secretResult = await getMFASecret();
        if (!secretResult.success || !secretResult.data?.encryptedMfaSecret) {
          setError('Failed to get MFA secret');
          setLoading(false);
          return;
        }

        const decryptResult = await decryptMFASecret(secretResult.data.encryptedMfaSecret, vaultKey);

        if (!decryptResult.success || !decryptResult.data) {
          setError(decryptResult.error || 'Failed to decrypt MFA secret');
          setLoading(false);
          return;
        }

        const secret = decryptResult.data;
        const isValid = verifyTOTPCode(secret, code);
        if (!isValid) {
          setError('Invalid verification code');
          setLoading(false);
          return;
        }

        const result = await verifyMFA(code, false);
        if (result.success && result.data?.verified) {
          onSuccess();
        } else {
          onSuccess();
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <Card>
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Lock className="size-6 text-primary" />
            </div>
          </div>
          <CardTitle>Two-Factor Authentication</CardTitle>
          <CardDescription>
            {useRecoveryCode
              ? 'Enter one of your recovery codes'
              : 'Enter the code from your authenticator app'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Input
            type="text"
            value={code}
            onChange={(e) => {
              const value = useRecoveryCode
                ? e.target.value.toUpperCase().slice(0, 8)
                : e.target.value.replace(/\D/g, '').slice(0, 6);
              setCode(value);
            }}
            placeholder={useRecoveryCode ? 'XXXXXXXX' : '000000'}
            className="text-center text-2xl tracking-widest font-mono py-3"
            maxLength={useRecoveryCode ? 8 : 6}
            autoFocus
          />

          <Button
            onClick={handleVerify}
            disabled={loading || (useRecoveryCode ? code.length !== 8 : code.length !== 6)}
            className="w-full"
          >
            {loading ? <><Spinner className="size-4 mr-2" /> Verifying…</> : 'Verify'}
          </Button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                setUseRecoveryCode(!useRecoveryCode);
                setCode('');
                setError(null);
              }}
              className="text-sm text-primary hover:text-primary/80"
            >
              {useRecoveryCode
                ? 'Use authenticator app instead'
                : 'Use a recovery code instead'}
            </button>
          </div>

          {onCancel && (
            <Button
              variant="ghost"
              onClick={onCancel}
              className="w-full"
            >
              Cancel
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
