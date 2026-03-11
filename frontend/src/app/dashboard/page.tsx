'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import FileVault from '@/components/FileVault';
import UnlockVault from '@/components/UnlockVault';
import SharedFilesView from '@/components/SharedFilesView';
import SecuritySettings from '@/components/SecuritySettings';
import TrashView from '@/components/TrashView';
import ActivityLog from '@/components/ActivityLog';
import { Logo, LogoLoader } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  Folder,
  Share2,
  ShieldCheck,
  LogOut,
  KeyRound,
  Lock,
  Cpu,
  Menu,
  X,
  Trash2,
  ClipboardList,
} from 'lucide-react';

const cryptoStats = [
  { icon: KeyRound, label: 'Key Derivation', value: 'PBKDF2-SHA256', detail: '100k iterations' },
  { icon: Lock, label: 'File Encryption', value: 'XChaCha20-Poly1305', detail: 'Per-file keys' },
  { icon: Cpu, label: 'Key Storage', value: 'Memory Only', detail: 'Cleared on refresh' },
];

export default function DashboardPage() {
  const { user, isAuthenticated, isLoading, hasVaultKey, needsUnlock, logout } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('my-files');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LogoLoader />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LogoLoader />
      </div>
    );
  }

  if (!hasVaultKey) {
    return <UnlockVault />;
  }

  const initials = user.email
    .split('@')[0]
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Logo size="sm" />
            </div>

            <div className="flex items-center gap-3">
              <ThemeToggle />

              <Separator orientation="vertical" className="h-6 hidden sm:block" />

              <div className="hidden sm:flex items-center gap-3">
                <Avatar className="size-8">
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
                <div className="hidden lg:block">
                  <p className="text-sm font-medium text-foreground truncate max-w-[150px]">
                    {user.email}
                  </p>
                  <Badge variant="outline" className="text-[10px] text-green-600 border-green-600/20">
                    Encrypted
                  </Badge>
                </div>
              </div>

              <Button variant="ghost" size="sm" onClick={handleLogout} className="hidden sm:flex gap-1.5">
                <LogOut className="size-4" />
                Sign Out
              </Button>

              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                {mobileMenuOpen ? <X className="size-6" /> : <Menu className="size-6" />}
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
              className="md:hidden border-t border-border"
            >
              <div className="px-4 py-4 space-y-2">
                {[
                  { id: 'my-files', label: 'My Files', icon: Folder },
                  { id: 'shared', label: 'Shared', icon: Share2 },
                  { id: 'trash', label: 'Trash', icon: Trash2 },
                  { id: 'activity', label: 'Activity', icon: ClipboardList },
                  { id: 'security', label: 'Security', icon: ShieldCheck },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => { setActiveTab(tab.id); setMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                      activeTab === tab.id
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <tab.icon className="size-4" />
                    {tab.label}
                  </button>
                ))}
                <Separator />
                <div className="flex items-center gap-3 px-4 py-3">
                  <Avatar className="size-8">
                    <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm text-muted-foreground truncate">{user.email}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={handleLogout} className="w-full justify-start px-4 gap-1.5">
                  <LogOut className="size-4" />
                  Sign Out
                </Button>
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
          <Card className="bg-green-500/5 border-green-500/20">
            <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                  <ShieldCheck className="size-5 text-green-600" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Zero-Knowledge Protection Active</p>
                  <p className="text-sm text-muted-foreground">
                    All files encrypted client-side. We can&apos;t read your data.
                  </p>
                </div>
              </div>

              <div className="hidden lg:flex items-center gap-4">
                {cryptoStats.map((stat) => (
                  <div key={stat.label} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background/50 border border-border/50">
                    <stat.icon className="size-4 text-primary" />
                    <div>
                      <p className="text-xs font-medium text-foreground">{stat.value}</p>
                      <p className="text-[10px] text-muted-foreground">{stat.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Tabs Content Area */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="hidden md:flex mb-6">
            <TabsTrigger value="my-files" className="gap-1.5">
              <Folder className="size-4" /> My Files
            </TabsTrigger>
            <TabsTrigger value="shared" className="gap-1.5">
              <Share2 className="size-4" /> Shared
            </TabsTrigger>
            <TabsTrigger value="trash" className="gap-1.5">
              <Trash2 className="size-4" /> Trash
            </TabsTrigger>
            <TabsTrigger value="activity" className="gap-1.5">
              <ClipboardList className="size-4" /> Activity
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-1.5">
              <ShieldCheck className="size-4" /> Security
            </TabsTrigger>
          </TabsList>

          <Card className="min-h-[500px]">
            <TabsContent value="my-files">
              <FileVault />
            </TabsContent>
            <TabsContent value="shared">
              <SharedFilesView />
            </TabsContent>
            <TabsContent value="trash">
              <TrashView />
            </TabsContent>
            <TabsContent value="activity">
              <ActivityLog />
            </TabsContent>
            <TabsContent value="security">
              <SecuritySettings />
            </TabsContent>
          </Card>
        </Tabs>

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
                  <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <stat.icon className="size-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.detail}</p>
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
