'use client';

import { useEffect, useState } from 'react';
import { Copy, Download, KeyRound, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import * as api from '@/lib/api';
import {
  buildRecoveryEnrollment,
  generateRecoveryKey,
  type GeneratedRecoveryKey,
} from '@/lib/crypto/recovery';
import { clearSensitiveData } from '@/lib/crypto/kdf';

export default function RecoveryKeySetup() {
  const { getVaultKey } = useAuth();
  const { confirm } = useConfirm();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [generated, setGenerated] = useState<GeneratedRecoveryKey | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.getRecoveryStatus().then((res) => {
      if (cancelled) return;
      if (res.success && res.data) setEnabled(res.data.recoveryEnabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleGenerate() {
    const vaultKey = getVaultKey();
    if (!vaultKey) {
      toast.error('Your session expired — sign in again to set up recovery.');
      return;
    }
    setBusy(true);
    try {
      const recovery = generateRecoveryKey();
      const enrollment = await buildRecoveryEnrollment(recovery.canonical, vaultKey);
      if (!enrollment.success || !enrollment.data) {
        toast.error('Could not derive recovery KEK', { description: enrollment.error });
        clearSensitiveData(recovery.raw);
        return;
      }
      const upload = await api.setupRecovery({
        recoverySalt: enrollment.data.recoverySalt,
        recoveryKdfParams: enrollment.data.recoveryKdfParams,
        encryptedVaultKeyRecovery: {
          ciphertext: enrollment.data.encryptedVaultKeyRecovery.ciphertext,
          algorithm: enrollment.data.encryptedVaultKeyRecovery.algorithm,
          version: enrollment.data.encryptedVaultKeyRecovery.version,
        },
      });
      if (!upload.success) {
        toast.error('Could not enroll recovery key', { description: upload.error });
        clearSensitiveData(recovery.raw);
        return;
      }
      setGenerated(recovery);
      setEnabled(true);
      setAcknowledged(false);
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    const ok = await confirm({
      title: 'Disable recovery key?',
      message:
        'If you lose your password, you will no longer be able to recover your vault. This cannot be undone.',
      confirmLabel: 'Disable',
      variant: 'destructive',
    });
    if (!ok) return;
    setBusy(true);
    const res = await api.disableRecovery();
    setBusy(false);
    if (res.success) {
      setEnabled(false);
      toast.success('Recovery key disabled');
    } else {
      toast.error('Could not disable recovery', { description: res.error });
    }
  }

  function copyToClipboard() {
    if (!generated) return;
    navigator.clipboard.writeText(generated.display);
    toast.success('Recovery key copied');
  }

  function downloadAsTextFile() {
    if (!generated) return;
    const blob = new Blob(
      [
        `SecureVault recovery key\nGenerated: ${new Date().toISOString()}\n\n${generated.display}\n\n` +
          `Store this in a password manager or printed in a safe place.\n` +
          `Anyone with this key + your account email can reset your password.`,
      ],
      { type: 'text/plain' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'securevault-recovery-key.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  function finishViewing() {
    if (!generated) return;
    clearSensitiveData(generated.raw);
    setGenerated(null);
    setAcknowledged(false);
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <KeyRound className="size-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Recovery key</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Generate a one-time recovery key so you can reset your password without losing access to
        your vault. The key is generated in your browser; we never see it.
      </p>

      {generated ? (
        <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
          <div className="flex items-start gap-2">
            <ShieldAlert className="size-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-foreground">
              <span className="font-semibold">Save this now.</span> It will not be shown again. We
              don&apos;t store the plaintext value.
            </p>
          </div>
          <pre className="font-mono text-sm text-foreground bg-background border border-border rounded p-3 select-all break-all">
            {generated.display}
          </pre>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={copyToClipboard}>
              <Copy className="size-3.5 mr-1.5" /> Copy
            </Button>
            <Button size="sm" variant="outline" onClick={downloadAsTextFile}>
              <Download className="size-3.5 mr-1.5" /> Download .txt
            </Button>
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            I&apos;ve saved this somewhere safe
          </label>
          <Button size="sm" disabled={!acknowledged} onClick={finishViewing}>
            Done
          </Button>
        </div>
      ) : enabled ? (
        <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
          <div className="flex items-start gap-2">
            <ShieldCheck className="size-4 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-foreground">Recovery key is active</p>
              <p className="text-xs text-muted-foreground">
                Regenerate to rotate the key, or disable to remove it.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={handleGenerate}>
              {busy ? <Spinner className="size-3" /> : 'Regenerate'}
            </Button>
            <Button size="sm" variant="destructive" disabled={busy} onClick={handleDisable}>
              <X className="size-3.5 mr-1.5" /> Disable
            </Button>
          </div>
        </div>
      ) : (
        <Button onClick={handleGenerate} disabled={busy || enabled === null}>
          {busy ? <Spinner className="size-4 mr-2" /> : <KeyRound className="size-4 mr-2" />}
          Generate recovery key
        </Button>
      )}
    </div>
  );
}
