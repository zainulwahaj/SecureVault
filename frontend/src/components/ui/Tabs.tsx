'use client';

import { useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';

export interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
  badge?: string | number;
}

export interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
  variant?: 'default' | 'pills' | 'underline';
  size?: 'sm' | 'md';
  fullWidth?: boolean;
}

export function Tabs({
  tabs,
  activeTab,
  onChange,
  variant = 'default',
  size = 'md',
  fullWidth = false,
}: TabsProps) {
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2.5 text-sm',
  };

  if (variant === 'pills') {
    return (
      <div
        className={clsx(
          'inline-flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl',
          fullWidth && 'w-full'
        )}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={clsx(
              'relative flex items-center justify-center gap-2 font-medium rounded-lg transition-colors',
              sizes[size],
              fullWidth && 'flex-1',
              activeTab === tab.id
                ? 'text-slate-900 dark:text-white'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            )}
          >
            {activeTab === tab.id && (
              <motion.div
                layoutId="activeTab"
                className="absolute inset-0 bg-white dark:bg-slate-700 rounded-lg shadow-sm"
                transition={{ type: 'spring', duration: 0.3 }}
              />
            )}
            <span className="relative flex items-center gap-2">
              {tab.icon}
              {tab.label}
              {tab.badge && (
                <span className="px-1.5 py-0.5 text-xs font-medium bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full">
                  {tab.badge}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    );
  }

  if (variant === 'underline') {
    return (
      <div className={clsx('border-b border-slate-200 dark:border-slate-700', fullWidth && 'w-full')}>
        <div className={clsx('flex gap-1', fullWidth && 'w-full')}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={clsx(
                'relative flex items-center gap-2 font-medium -mb-px border-b-2 transition-colors',
                sizes[size],
                fullWidth && 'flex-1 justify-center',
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
              )}
            >
              {tab.icon}
              {tab.label}
              {tab.badge && (
                <span className="px-1.5 py-0.5 text-xs font-medium bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Default variant
  return (
    <div className={clsx('flex gap-1', fullWidth && 'w-full')}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={clsx(
            'relative flex items-center gap-2 font-medium rounded-lg transition-all',
            sizes[size],
            fullWidth && 'flex-1 justify-center',
            activeTab === tab.id
              ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/50'
          )}
        >
          {tab.icon}
          {tab.label}
          {tab.badge && (
            <span className="px-1.5 py-0.5 text-xs font-medium bg-primary-500/20 text-primary-700 dark:text-primary-300 rounded-full">
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
