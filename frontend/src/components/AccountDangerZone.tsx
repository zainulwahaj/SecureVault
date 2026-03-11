'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-8 pt-8 border-t border-border"
    >
      <Card className="border-destructive/30">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="size-5 text-destructive" />
            </div>
            <div>
              <CardTitle className="text-destructive">Danger Zone</CardTitle>
              <CardDescription>Irreversible account actions</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 rounded-lg bg-destructive/5 border border-destructive/20">
            <h4 className="font-medium text-foreground mb-2">
              Delete Account
            </h4>
            <p className="text-sm text-muted-foreground mb-4">
              Permanently delete your account and all associated data. This action cannot be undone.
              All your files, shares, and settings will be permanently erased.
            </p>

            <div className="space-y-3">
              <div>
                <Label className="text-destructive/80">
                  Type &ldquo;delete my account&rdquo; to confirm
                </Label>
                <Input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="delete my account"
                  className="mt-1"
                />
              </div>

              <Button
                variant="destructive"
                onClick={handleDeleteAccount}
                disabled={isDeleting || confirmText.toLowerCase() !== 'delete my account'}
                className="w-full"
              >
                {isDeleting ? <><Spinner className="size-4 mr-2" /> Deleting…</> : <><Trash2 className="size-4 mr-2" /> Delete My Account</>}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
