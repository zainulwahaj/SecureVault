'use client';

import { useState } from 'react';
import { verifyMFA, getMFASecret, webauthnAuthBegin, webauthnAuthComplete } from '@/lib/api';
import { decryptMFASecret, verifyTOTPCode } from '@/lib/crypto';
import {
  getWebAuthnAssertion,
  serializeAssertion,
  webauthnAvailable,
} from '@/lib/auth/webauthn';
import { Fingerprint } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import OTPInput from '@/components/ui/otpinput';
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

  async function handleVerify(submittedCode?: string) {
    const codeToUse = submittedCode ?? code;
    if (useRecoveryCode) {
      const normalized = codeToUse.replace(/-/g, '');
      if (normalized.length !== 16) {
        setError('Recovery code must be 16 characters');
        return;
      }
    } else {
      if (codeToUse.length !== 6) {
        setError('Please enter a valid 6-digit code');
        return;
      }
    }

    setError(null);
    setLoading(true);

    try {
      if (useRecoveryCode) {
        const result = await verifyMFA(codeToUse, true);
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
        const isValid = verifyTOTPCode(secret, codeToUse);
        if (!isValid) {
          setError('Invalid verification code');
          setLoading(false);
          return;
        }

        const result = await verifyMFA(codeToUse, false);
        if (result.success && result.data?.verified) {
          onSuccess();
        } else {
          setError(result.error || 'MFA verification failed');
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

          {useRecoveryCode ? (
            <Input
              type="text"
              value={code}
              onChange={(e) => {
                const value = e.target.value.toUpperCase().slice(0, 19);
                setCode(value);
              }}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              className="text-center text-2xl tracking-widest font-mono py-3"
              maxLength={19}
              autoFocus
            />
          ) : (
            <OTPInput
              length={6}
              separator
              label=""
              value={code}
              onChange={setCode}
              onComplete={(otp) => handleVerify(otp)}
            />
          )}

          <Button
            onClick={() => handleVerify()}
            disabled={loading || (useRecoveryCode ? code.replace(/-/g, '').length !== 16 : code.length !== 6)}
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

          {webauthnAvailable() && (
            <Button
              variant="outline"
              type="button"
              disabled={loading}
              onClick={async () => {
                setError(null);
                setLoading(true);
                try {
                  const begin = await webauthnAuthBegin();
                  if (!begin.success || !begin.data) {
                    setError(begin.error || 'No passkey registered');
                    return;
                  }
                  const credential = await getWebAuthnAssertion(
                    begin.data.options as Parameters<typeof getWebAuthnAssertion>[0],
                  );
                  const complete = await webauthnAuthComplete({
                    challengeId: begin.data.challengeId,
                    credential: serializeAssertion(credential),
                  });
                  if (!complete.success) {
                    setError(complete.error || 'Passkey verification failed');
                    return;
                  }
                  onSuccess();
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Passkey cancelled');
                } finally {
                  setLoading(false);
                }
              }}
              className="w-full"
            >
              <Fingerprint className="size-4 mr-2" /> Verify with passkey
            </Button>
          )}

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
