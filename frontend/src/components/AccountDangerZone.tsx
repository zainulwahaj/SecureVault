'use client';

import { useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import * as api from '@/lib/api';
import { AlertTriangle, Trash2 } from 'lucide-react';

export default function AccountDangerZone() {
  const { logout } = useAuth();
  const { confirm } = useConfirm();
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const handleDeleteAccount = useCallback(async () => {
    const confirmed = await confirm({
      title: 'Delete Account',
      message: 'This will permanently delete your account and all associated data. This action cannot be undone.',
      confirmLabel: 'Delete Account',
      variant: 'destructive',
    });
    if (!confirmed) return;

    if (confirmText.toLowerCase() !== 'delete my account') {
      toast.error('Please type "delete my account" to confirm');
      return;
    }

    setIsDeleting(true);

    try {
      toast.warning('Account deletion', { description: 'This feature will be available soon. Your account is safe.' });
    } catch {
      toast.error('Failed to delete account', { description: 'An unexpected error occurred' });
    } finally {
      setIsDeleting(false);
      setConfirmText('');
    }
  }, [confirm, confirmText]);

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <AlertTriangle className="size-5 text-destructive" />
        <div>
          <h3 className="text-base font-semibold text-destructive">Danger Zone</h3>
          <p className="text-sm text-muted-foreground">Irreversible account actions</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <h4 className="text-sm font-medium text-foreground">Delete Account</h4>
          <p className="text-sm text-muted-foreground mt-1">
            Permanently delete your account and all data. This cannot be undone.
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">
            Type &ldquo;delete my account&rdquo; to confirm
          </Label>
          <Input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="delete my account"
            className="h-9"
          />
        </div>

        <Button
          variant="destructive"
          size="sm"
          onClick={handleDeleteAccount}
          disabled={isDeleting || confirmText.toLowerCase() !== 'delete my account'}
          className="w-full"
        >
          {isDeleting ? <><Spinner className="size-4 mr-2" /> Deleting...</> : <><Trash2 className="size-4 mr-2" /> Delete My Account</>}
        </Button>
      </div>
    </div>
  );
}
