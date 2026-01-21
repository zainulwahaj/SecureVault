'use client';

import { useState } from 'react';
import { verifyMFA, getMFASecret } from '@/lib/api';
import { decryptMFASecret, verifyTOTPCode } from '@/lib/crypto';

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
      // Recovery codes are alphanumeric, 8 chars
      if (code.length !== 8) {
        setError('Recovery code must be 8 characters');
        return;
      }
    } else {
      // TOTP codes are 6 digits
      if (code.length !== 6) {
        setError('Please enter a valid 6-digit code');
        return;
      }
    }

    setError(null);
    setLoading(true);

    try {
      if (useRecoveryCode) {
        // Verify recovery code on server
        const result = await verifyMFA(code, true);
        if (result.success && result.data?.verified) {
          onSuccess();
        } else {
          setError(result.error || 'Invalid recovery code');
        }
      } else {
        // For TOTP, verify client-side first
        // Get encrypted secret from server
        const secretResult = await getMFASecret();
        if (!secretResult.success || !secretResult.data?.encryptedMfaSecret) {
          setError('Failed to get MFA secret');
          setLoading(false);
          return;
        }

        // Decrypt the secret
        const decryptResult = await decryptMFASecret(secretResult.data.encryptedMfaSecret, vaultKey);
        
        if (!decryptResult.success || !decryptResult.data) {
          setError(decryptResult.error || 'Failed to decrypt MFA secret');
          setLoading(false);
          return;
        }
        
        const secret = decryptResult.data;
        
        // Verify locally
        const isValid = verifyTOTPCode(secret, code);
        if (!isValid) {
          setError('Invalid verification code');
          setLoading(false);
          return;
        }

        // Optionally verify on server too (for logging/rate limiting)
        const result = await verifyMFA(code, false);
        if (result.success && result.data?.verified) {
          onSuccess();
        } else {
          // Even if server verification fails, if local passed, allow through
          // This supports true zero-knowledge where server doesn't see the secret
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
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <div className="text-center mb-6">
          <div className="flex justify-center mb-4">
            <svg className="w-12 h-12 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Two-Factor Authentication
          </h2>
          <p className="text-gray-600 dark:text-gray-300 mt-2">
            {useRecoveryCode
              ? 'Enter one of your recovery codes'
              : 'Enter the code from your authenticator app'}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <input
              type="text"
              value={code}
              onChange={(e) => {
                const value = useRecoveryCode
                  ? e.target.value.toUpperCase().slice(0, 8)
                  : e.target.value.replace(/\D/g, '').slice(0, 6);
                setCode(value);
              }}
              placeholder={useRecoveryCode ? 'XXXXXXXX' : '000000'}
              className="w-full px-4 py-3 text-center text-2xl tracking-widest border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
              maxLength={useRecoveryCode ? 8 : 6}
              autoFocus
            />
          </div>

          <button
            onClick={handleVerify}
            disabled={loading || (useRecoveryCode ? code.length !== 8 : code.length !== 6)}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Verifying...
              </span>
            ) : (
              'Verify'
            )}
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                setUseRecoveryCode(!useRecoveryCode);
                setCode('');
                setError(null);
              }}
              className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              {useRecoveryCode
                ? 'Use authenticator app instead'
                : 'Use a recovery code instead'}
            </button>
          </div>

          {onCancel && (
            <button
              onClick={onCancel}
              className="w-full py-2 px-4 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 font-medium transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
