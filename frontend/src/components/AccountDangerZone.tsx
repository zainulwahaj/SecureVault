'use client';

/**
 * AccountDangerZone - Account deletion and dangerous settings
 */

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import * as api from '@/lib/api';
import {
  ExclamationTriangleIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';

export default function AccountDangerZone() {
  const { logout } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const { confirmAccountDelete } = useConfirm();
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const handleDeleteAccount = useCallback(async () => {
    // First confirmation via dialog
    const confirmed = await confirmAccountDelete();
    if (!confirmed) return;
    
    // Second confirmation: user must type "delete my account"
    if (confirmText.toLowerCase() !== 'delete my account') {
      toast.error('Please type "delete my account" to confirm');
      return;
    }

    setIsDeleting(true);
    
    try {
      // Note: This API endpoint needs to be implemented in the backend
      // For now, we'll show a toast that the feature is coming
      toast.warning('Account deletion', 'This feature will be available soon. Your account is safe.');
      
      // When the backend is ready, uncomment this:
      // const result = await api.deleteAccount();
      // if (result.success) {
      //   await logout();
      //   router.push('/');
      //   toast.success('Account deleted', 'Your account and all data have been permanently deleted');
      // } else {
      //   toast.error('Failed to delete account', result.error);
      // }
    } catch {
      toast.error('Failed to delete account', 'An unexpected error occurred');
    } finally {
      setIsDeleting(false);
      setConfirmText('');
    }
  }, [confirmAccountDelete, confirmText, toast]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-8 pt-8 border-t border-slate-200 dark:border-slate-700"
    >
      <Card variant="bordered" className="border-error-200 dark:border-error-800">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-error-100 dark:bg-error-900/30 flex items-center justify-center">
              <ExclamationTriangleIcon className="w-5 h-5 text-error-600 dark:text-error-400" />
            </div>
            <div>
              <CardTitle className="text-error-700 dark:text-error-400">Danger Zone</CardTitle>
              <CardDescription>Irreversible account actions</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 rounded-lg bg-error-50 dark:bg-error-900/10 border border-error-200 dark:border-error-800">
            <h4 className="font-medium text-error-900 dark:text-error-100 mb-2">
              Delete Account
            </h4>
            <p className="text-sm text-error-700 dark:text-error-300 mb-4">
              Permanently delete your account and all associated data. This action cannot be undone.
              All your files, shares, and settings will be permanently erased.
            </p>
            
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-error-700 dark:text-error-300 mb-1">
                  Type "delete my account" to confirm
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="delete my account"
                  className="w-full px-4 py-2 text-sm border border-error-300 dark:border-error-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-error-500 focus:border-error-500"
                />
              </div>
              
              <Button
                variant="danger"
                onClick={handleDeleteAccount}
                disabled={isDeleting || confirmText.toLowerCase() !== 'delete my account'}
                loading={isDeleting}
                className="w-full"
              >
                <TrashIcon className="w-4 h-4" />
                Delete My Account
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
