'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { AppNavbar } from '@/components/AppNavbar';
import FileVault from '@/components/FileVault';
import ExplorerView from '@/components/ExplorerView';
import SharedFilesView from '@/components/SharedFilesView';
import TrashView from '@/components/TrashView';
import ActivityLog from '@/components/ActivityLog';
import SecuritySettings from '@/components/SecuritySettings';
import UnlockVault from '@/components/UnlockVault';
import { LogoLoader } from '@/components/ui/Logo';
import { motion, AnimatePresence } from 'framer-motion';

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

export default function DashboardPage() {
  const { user, isLoading, hasVaultKey, logout } = useAuth();
  const router = useRouter();
  const [activeView, setActiveView] = useState('my-files');
  const [storageUsed, setStorageUsed] = useState(0);
  const [fileCount, setFileCount] = useState(0);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  const handleLogout = useCallback(async () => {
    await logout();
    router.push('/');
  }, [logout, router]);

  const handleStorageUpdate = useCallback((bytes: number, count: number) => {
    setStorageUsed(bytes);
    setFileCount(count);
  }, []);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LogoLoader />
      </div>
    );
  }

  if (!hasVaultKey) {
    return <UnlockVault />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppNavbar
        activeView={activeView}
        onNavigate={setActiveView}
        onLogout={handleLogout}
        storageUsed={storageUsed}
        fileCount={fileCount}
      />

      <main className="flex-1 overflow-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeView}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="mx-auto max-w-screen-2xl"
          >
            {activeView === 'my-files' && (
              <FileVault onStorageUpdate={handleStorageUpdate} />
            )}
            {activeView === 'explorer' && <ExplorerView />}
            {activeView === 'shared' && <SharedFilesView />}
            {activeView === 'trash' && <TrashView />}
            {activeView === 'activity' && <ActivityLog />}
            {activeView === 'security' && <SecuritySettings />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
