'use client';

import { createContext, useContext, useState, useCallback, type ReactNode, useRef, Fragment } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, Transition } from '@headlessui/react';
import { clsx } from 'clsx';
import {
  ExclamationTriangleIcon,
  TrashIcon,
  ShieldExclamationIcon,
  QuestionMarkCircleIcon,
} from '@heroicons/react/24/outline';
import { Button } from './Button';

type ConfirmType = 'danger' | 'warning' | 'info';

interface ConfirmOptions {
  type?: ConfirmType;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  icon?: 'trash' | 'shield' | 'warning' | 'question';
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  confirmDelete: (itemName: string) => Promise<boolean>;
  confirmDisableMFA: () => Promise<boolean>;
  confirmRemoveShare: (email: string, filename?: string) => Promise<boolean>;
  confirmLogout: () => Promise<boolean>;
  confirmAccountDelete: () => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

const icons = {
  trash: TrashIcon,
  shield: ShieldExclamationIcon,
  warning: ExclamationTriangleIcon,
  question: QuestionMarkCircleIcon,
};

const typeStyles = {
  danger: {
    icon: 'text-red-500 dark:text-red-400 bg-red-100 dark:bg-red-900/30',
    button: 'bg-red-600 hover:bg-red-700 text-white',
  },
  warning: {
    icon: 'text-yellow-500 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30',
    button: 'bg-yellow-600 hover:bg-yellow-700 text-white',
  },
  info: {
    icon: 'text-blue-500 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30',
    button: 'bg-blue-600 hover:bg-blue-700 text-white',
  },
};

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setOptions(opts);
      setIsOpen(true);
      resolveRef.current = resolve;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setIsOpen(false);
    resolveRef.current?.(true);
  }, []);

  const handleCancel = useCallback(() => {
    setIsOpen(false);
    resolveRef.current?.(false);
  }, []);

  const confirmDelete = useCallback((itemName: string) => {
    return confirm({
      type: 'danger',
      title: 'Delete File',
      message: `Are you sure you want to delete "${itemName}"? This action cannot be undone.`,
      confirmLabel: 'Delete',
      icon: 'trash',
    });
  }, [confirm]);

  const confirmDisableMFA = useCallback(() => {
    return confirm({
      type: 'danger',
      title: 'Disable Two-Factor Authentication',
      message: 'Disabling 2FA will make your account less secure. Are you sure you want to continue?',
      confirmLabel: 'Disable 2FA',
      icon: 'shield',
    });
  }, [confirm]);

  const confirmRemoveShare = useCallback((email: string, filename?: string) => {
    return confirm({
      type: 'warning',
      title: 'Remove Access',
      message: filename 
        ? `Are you sure you want to remove ${email}'s access to "${filename}"?`
        : `Are you sure you want to remove ${email}'s access to this file?`,
      confirmLabel: 'Remove Access',
      icon: 'warning',
    });
  }, [confirm]);

  const confirmLogout = useCallback(() => {
    return confirm({
      type: 'info',
      title: 'Sign Out',
      message: 'Are you sure you want to sign out? Your vault key will be cleared from memory.',
      confirmLabel: 'Sign Out',
      icon: 'question',
    });
  }, [confirm]);

  const confirmAccountDelete = useCallback(() => {
    return confirm({
      type: 'danger',
      title: 'Delete Account',
      message: 'This will permanently delete your account and all files. This action cannot be undone.',
      confirmLabel: 'Delete My Account',
      icon: 'trash',
    });
  }, [confirm]);

  const Icon = options?.icon ? icons[options.icon] : icons.warning;
  const type = options?.type || 'warning';
  const style = typeStyles[type];

  return (
    <ConfirmContext.Provider value={{ confirm, confirmDelete, confirmDisableMFA, confirmRemoveShare, confirmLogout, confirmAccountDelete }}>
      {children}
      
      <Transition appear show={isOpen} as={Fragment}>
        <Dialog as="div" className="relative z-[101]" onClose={handleCancel}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-200"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-150"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white dark:bg-slate-800 p-6 shadow-xl transition-all">
                  <div className="flex items-start gap-4">
                    <div className={clsx('p-3 rounded-full', style.icon)}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-white">
                        {options?.title}
                      </Dialog.Title>
                      <Dialog.Description className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                        {options?.message}
                      </Dialog.Description>
                    </div>
                  </div>

                  <div className="mt-6 flex gap-3 justify-end">
                    <Button
                      variant="secondary"
                      onClick={handleCancel}
                    >
                      {options?.cancelLabel || 'Cancel'}
                    </Button>
                    <button
                      onClick={handleConfirm}
                      className={clsx(
                        'px-4 py-2 rounded-lg font-medium transition-colors',
                        style.button
                      )}
                    >
                      {options?.confirmLabel || 'Confirm'}
                    </button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return context;
}
