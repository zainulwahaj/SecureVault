'use client';

import { Fragment, type ReactNode } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  showClose?: boolean;
}

const sizes = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  full: 'max-w-4xl',
};

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'md',
  showClose = true,
}: ModalProps) {
  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        {/* Backdrop */}
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel
                className={clsx(
                  'w-full transform overflow-hidden rounded-2xl',
                  'bg-white dark:bg-slate-800',
                  'p-6 text-left align-middle shadow-xl',
                  'border border-slate-200 dark:border-slate-700',
                  'transition-all',
                  sizes[size]
                )}
              >
                {/* Header */}
                {(title || showClose) && (
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      {title && (
                        <Dialog.Title
                          as="h3"
                          className="text-lg font-semibold text-slate-900 dark:text-white"
                        >
                          {title}
                        </Dialog.Title>
                      )}
                      {description && (
                        <Dialog.Description className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          {description}
                        </Dialog.Description>
                      )}
                    </div>
                    {showClose && (
                      <button
                        onClick={onClose}
                        className="p-2 -m-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
                      >
                        <XMarkIcon className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                )}

                {/* Content */}
                <div>{children}</div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}

export function ModalActions({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        'mt-6 pt-4 border-t border-slate-200 dark:border-slate-700',
        'flex items-center justify-end gap-3',
        className
      )}
    >
      {children}
    </div>
  );
}

Modal.Actions = ModalActions;
