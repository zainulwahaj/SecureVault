'use client';

import { useEffect, useState } from 'react';
import { Fingerprint, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import {
  createWebAuthnCredential,
  serializeAttestation,
  webauthnAvailable,
} from '@/lib/auth/webauthn';

export default function PasskeyManager() {
  const { confirm } = useConfirm();
  const [credentials, setCredentials] = useState<api.WebAuthnCredentialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const supported = webauthnAvailable();

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    const res = await api.listWebAuthnCredentials();
    if (res.success && res.data) setCredentials(res.data.credentials);
    setLoading(false);
  }

  async function handleAdd() {
    setAdding(true);
    try {
      const begin = await api.webauthnRegisterBegin();
      if (!begin.success || !begin.data) {
        toast.error('Could not start passkey registration', { description: begin.error });
        return;
      }
      const credential = await createWebAuthnCredential(begin.data.options as Parameters<typeof createWebAuthnCredential>[0]);
      const labelFromUA = navigator.userAgent.includes('Mac')
        ? 'Mac passkey'
        : navigator.userAgent.includes('Windows')
        ? 'Windows passkey'
        : navigator.userAgent.includes('Android')
        ? 'Android passkey'
        : 'Passkey';
      const complete = await api.webauthnRegisterComplete({
        challengeId: begin.data.challengeId,
        label: labelFromUA,
        credential: serializeAttestation(credential),
      });
      if (!complete.success) {
        toast.error('Passkey registration failed', { description: complete.error });
        return;
      }
      toast.success('Passkey registered');
      await refresh();
    } catch (err) {
      toast.error('Passkey registration cancelled', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setAdding(false);
    }
  }

  async function handleRevoke(id: string, label: string | null) {
    const ok = await confirm({
      title: 'Remove passkey?',
      message: `Remove "${label ?? 'passkey'}" from this account?`,
      confirmLabel: 'Remove',
      variant: 'destructive',
    });
    if (!ok) return;
    const res = await api.revokeWebAuthnCredential(id);
    if (res.success) {
      setCredentials((prev) => prev.filter((c) => c.id !== id));
      toast.success('Passkey removed');
    } else {
      toast.error('Could not remove passkey', { description: res.error });
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Fingerprint className="size-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Passkeys</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Register a passkey as a second factor. Passkeys use your device&apos;s biometric or PIN
        instead of TOTP codes.
      </p>

      {!supported && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-foreground">
          This browser does not support WebAuthn.
        </div>
      )}

      {loading ? (
        <Spinner className="size-4" />
      ) : credentials.length === 0 ? (
        <p className="text-sm text-muted-foreground mb-4">No passkeys registered yet.</p>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-lg mb-4">
          {credentials.map((c) => (
            <li key={c.id} className="flex items-center justify-between p-3">
              <div>
                <p className="text-sm font-medium text-foreground">{c.label ?? 'Unnamed passkey'}</p>
                <p className="text-xs text-muted-foreground">
                  Added {new Date(c.createdAt).toLocaleDateString()}
                  {c.lastUsedAt ? ` · Last used ${new Date(c.lastUsedAt).toLocaleDateString()}` : ''}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => handleRevoke(c.id, c.label)}>
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Button disabled={!supported || adding} onClick={handleAdd}>
        {adding ? <Spinner className="size-4 mr-2" /> : <Plus className="size-4 mr-2" />}
        Add passkey
      </Button>
    </div>
  );
}
