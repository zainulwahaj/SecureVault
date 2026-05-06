'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import * as api from '@/lib/api';
import { generateLoginProof, bytesToBase64, clearSensitiveData } from '@/lib/crypto';
import { deriveKEK, generateSalt } from '@/lib/crypto/kdf';
import { encryptVaultKey } from '@/lib/crypto/encryption';
import { DEFAULT_KDF_PARAMS } from '@/lib/crypto/types';
import { encryptPrivateKey, decryptPrivateKey } from '@/lib/crypto/keypair';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { KeyRound, ShieldCheck } from 'lucide-react';

export default function ChangePassword() {
  const { getVaultKey, user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword || !currentPassword) {
      toast.error('Please fill in all fields');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }

    const vaultKey = getVaultKey();
    if (!vaultKey) {
      toast.error('Vault is locked');
      return;
    }

    setIsLoading(true);

    try {
      const oldProof = await generateLoginProof(vaultKey);

      const newSalt = generateSalt();
      const kekResult = await deriveKEK(newPassword, newSalt, DEFAULT_KDF_PARAMS);
      if (!kekResult.success || !kekResult.data) {
        toast.error('Failed to derive new key');
        return;
      }

      const encResult = await encryptVaultKey(vaultKey, kekResult.data);
      if (!encResult.success || !encResult.data) {
        toast.error('Failed to re-encrypt vault key');
        return;
      }

      const newProof = await generateLoginProof(vaultKey);

      const privKeyResponse = await api.getMyEncryptedPrivateKey();
      let newEncryptedPrivateKey = '';

      if (privKeyResponse.success && privKeyResponse.data) {
        const rawPrivKey = await decryptPrivateKey(privKeyResponse.data.encryptedPrivateKey, vaultKey);
        newEncryptedPrivateKey = await encryptPrivateKey(rawPrivKey, vaultKey);
        clearSensitiveData(rawPrivKey);
      }

      const result = await api.changePassword({
        oldProof,
        salt: bytesToBase64(newSalt),
        kdfParams: DEFAULT_KDF_PARAMS,
        encryptedVaultKey: encResult.data,
        loginProof: newProof,
        encryptedPrivateKey: newEncryptedPrivateKey,
      });

      clearSensitiveData(kekResult.data);

      if (result.success) {
        toast.success('Password changed successfully');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        toast.error('Failed to change password', { description: result.error });
      }
    } catch (err) {
      toast.error('An error occurred while changing password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <KeyRound className="size-5 text-primary" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">Change Password</h3>
          <p className="text-sm text-muted-foreground">
            Your password is never sent to the server
          </p>
        </div>
      </div>

      <div className="space-y-3 max-w-sm">
        <div>
          <label className="text-sm font-medium text-foreground mb-1.5 block">
            Current Password
          </label>
          <Input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Enter current password"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-foreground mb-1.5 block">
            New Password
          </label>
          <Input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-foreground mb-1.5 block">
            Confirm New Password
          </label>
          <Input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter new password"
            onKeyDown={(e) => { if (e.key === 'Enter') handleChangePassword(); }}
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
          <ShieldCheck className="size-3.5" />
          <span>Zero-knowledge: password is processed locally and never leaves your browser</span>
        </div>

        <Button
          onClick={handleChangePassword}
          disabled={isLoading || !currentPassword || !newPassword || !confirmPassword}
          className="mt-2"
        >
          {isLoading ? <Spinner className="size-4 mr-2" /> : <KeyRound className="size-4 mr-2" />}
          Change Password
        </Button>
      </div>
    </div>
  );
}
