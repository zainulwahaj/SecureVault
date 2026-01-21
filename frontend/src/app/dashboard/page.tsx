'use client';

/**
 * Dashboard Page (Protected) - Zero-Knowledge Vault
 * 
 * Shows after successful authentication.
 * VaultKey is held in memory only during this session.
 * File encryption/decryption happens entirely client-side.
 * 
 * If user refreshes page, VaultKey is lost and they need to unlock.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import FileVault from '@/components/FileVault';
import UnlockVault from '@/components/UnlockVault';
import SharedFilesView from '@/components/SharedFilesView';
import SecuritySettings from '@/components/SecuritySettings';
import { Logo, LogoLoader } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Tabs } from '@/components/ui/Tabs';
import {
  FolderIcon,
  ShareIcon,
  ShieldCheckIcon,
  ArrowRightOnRectangleIcon,
  KeyIcon,
  LockClosedIcon,
  CpuChipIcon,
  Bars3Icon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

const tabs = [
  { id: 'my-files', label: 'My Files', icon: <FolderIcon className="w-4 h-4" /> },
  { id: 'shared', label: 'Shared', icon: <ShareIcon className="w-4 h-4" /> },
  { id: 'security', label: 'Security', icon: <ShieldCheckIcon className="w-4 h-4" /> },
];

const cryptoStats = [
  {
    icon: KeyIcon,
    label: 'Key Derivation',
    value: 'PBKDF2-SHA256',
    detail: '100k iterations',
  },
  {
    icon: LockClosedIcon,
    label: 'File Encryption',
    value: 'XChaCha20-Poly1305',
    detail: 'Per-file keys',
  },
  {
    icon: CpuChipIcon,
    label: 'Key Storage',
    value: 'Memory Only',
    detail: 'Cleared on refresh',
  },
];

export default function DashboardPage() {
  const { user, isAuthenticated, isLoading, hasVaultKey, needsUnlock, logout } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('my-files');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Redirect to login only if no session at all
  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  async function handleLogout() {
    await logout();
    router.push('/');
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <LogoLoader />
      </div>
    );
  }

  // No user session - will redirect to login
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <LogoLoader />
      </div>
    );
  }

  // User has session but needs to unlock (page was refreshed)
  // Check directly: has user but no vault key
  if (!hasVaultKey) {
    return <UnlockVault />;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left side */}
            <div className="flex items-center gap-4">
              <Logo size="sm" />
              
              {/* Desktop nav */}
              <nav className="hidden md:flex items-center">
                <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-4" />
                <Tabs
                  tabs={tabs}
                  activeTab={activeTab}
                  onChange={setActiveTab}
                  variant="pills"
                />
              </nav>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-3">
              <ThemeToggle />
              
              {/* User menu */}
              <div className="hidden sm:flex items-center gap-3 pl-3 border-l border-slate-200 dark:border-slate-700">
                <Avatar
                  name={user.email}
                  size="sm"
                />
                <div className="hidden lg:block">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate max-w-[150px]">
                    {user.email}
                  </p>
                  <Badge variant="success" size="sm" dot>
                    Encrypted
                  </Badge>
                </div>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="hidden sm:flex"
              >
                <ArrowRightOnRectangleIcon className="w-4 h-4" />
                Sign Out
              </Button>

              {/* Mobile menu button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:hover:text-white dark:hover:bg-slate-800"
              >
                {mobileMenuOpen ? (
                  <XMarkIcon className="w-6 h-6" />
                ) : (
                  <Bars3Icon className="w-6 h-6" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile navigation */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden border-t border-slate-200 dark:border-slate-800"
            >
              <div className="px-4 py-4 space-y-2">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                      activeTab === tab.id
                        ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <Avatar name={user.email} size="sm" />
                    <span className="text-sm text-slate-600 dark:text-slate-400 truncate">
                      {user.email}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleLogout}
                    className="w-full justify-start px-4"
                  >
                    <ArrowRightOnRectangleIcon className="w-4 h-4" />
                    Sign Out
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Security Status Banner */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <Card className="bg-gradient-to-r from-success-50 to-primary-50 dark:from-success-900/20 dark:to-primary-900/20 border-success-200 dark:border-success-800/50">
            <div className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-success-100 dark:bg-success-900/30 flex items-center justify-center">
                  <ShieldCheckIcon className="w-5 h-5 text-success-600 dark:text-success-400" />
                </div>
                <div>
                  <p className="font-semibold text-success-900 dark:text-success-100">
                    Zero-Knowledge Protection Active
                  </p>
                  <p className="text-sm text-success-700 dark:text-success-300">
                    All files encrypted client-side. We can&apos;t read your data.
                  </p>
                </div>
              </div>
              
              {/* Crypto stats - desktop */}
              <div className="hidden lg:flex items-center gap-4">
                {cryptoStats.map((stat) => (
                  <div key={stat.label} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/50 dark:bg-slate-800/50">
                    <stat.icon className="w-4 h-4 text-primary-500" />
                    <div>
                      <p className="text-xs font-medium text-slate-900 dark:text-white">{stat.value}</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">{stat.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Content Area */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <Card className="min-h-[500px]">
            <AnimatePresence mode="wait">
              {activeTab === 'my-files' && (
                <motion.div
                  key="my-files"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <FileVault />
                </motion.div>
              )}
              {activeTab === 'shared' && (
                <motion.div
                  key="shared"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <SharedFilesView />
                </motion.div>
              )}
              {activeTab === 'security' && (
                <motion.div
                  key="security"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <SecuritySettings />
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        </motion.div>

        {/* Crypto Stats - Mobile */}
        <div className="lg:hidden mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {cryptoStats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                    <stat.icon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{stat.value}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{stat.detail}</p>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </main>
    </div>
  );
}
