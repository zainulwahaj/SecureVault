'use client';

import { useState } from 'react';
import MFASetup from './MFASetup';
import ChangePassword from './ChangePassword';
import AccountDangerZone from './AccountDangerZone';
import ProfileSettings from './ProfileSettings';
import PreferencesSettings from './PreferencesSettings';
import SessionDevices from './SessionDevices';
import RecoveryKeySetup from './RecoveryKeySetup';
import PasskeyManager from './PasskeyManager';
import { PageShell, MonoChip } from '@/components/cipher-lab';
import { Separator } from '@/components/ui/separator';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { User, Shield, Sliders } from 'lucide-react';

type SettingsTab = 'profile' | 'security' | 'preferences';

const tabs: { id: SettingsTab; label: string; icon: typeof User }[] = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'preferences', label: 'Preferences', icon: Sliders },
];

export default function SecuritySettings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

  return (
    <PageShell className="p-4 sm:p-6 lg:p-8 max-w-3xl min-w-0 overflow-hidden">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary mb-3">
          § VAULT · 06_SETTINGS
        </div>
        <h1 className="text-3xl sm:text-4xl font-medium tracking-[-0.03em] leading-[1.05] text-foreground">
          Account
          <span
            className="font-normal italic text-primary ml-1"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            controls
          </span>
          <span className="text-primary">.</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
          Profile, password, two-factor, passkeys, recovery key, and active sessions.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <MonoChip tone="primary">CLIENT-SIDE</MonoChip>
          <MonoChip tone="ok">ZK-AUTH</MonoChip>
        </div>
      </motion.div>

      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit mb-8">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all',
                activeTab === tab.id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="size-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
      >
        {activeTab === 'profile' && (
          <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
            <ProfileSettings />
          </div>
        )}

        {activeTab === 'security' && (
          <div className="space-y-8">
            <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
              <ChangePassword />
            </div>

            <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
              <MFASetup />
            </div>

            <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
              <PasskeyManager />
            </div>

            <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
              <RecoveryKeySetup />
            </div>

            <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
              <SessionDevices />
            </div>

            <Separator />

            <div className="rounded-xl border border-destructive/20 bg-card p-5 sm:p-6">
              <AccountDangerZone />
            </div>
          </div>
        )}

        {activeTab === 'preferences' && (
          <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
            <PreferencesSettings />
          </div>
        )}
      </motion.div>
    </PageShell>
  );
}
