'use client';

import { useState } from 'react';
import MFASetup from './MFASetup';
import ChangePassword from './ChangePassword';
import AccountDangerZone from './AccountDangerZone';
import ProfileSettings from './ProfileSettings';
import PreferencesSettings from './PreferencesSettings';
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
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl min-w-0 overflow-hidden">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account and preferences</p>
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
    </div>
  );
}
