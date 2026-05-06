'use client';

import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Sliders, Moon, Sun, Monitor, Bell, Download, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';

type ThemeOption = 'light' | 'dark' | 'system';

function getStoredTheme(): ThemeOption {
  if (typeof window === 'undefined') return 'system';
  const stored = localStorage.getItem('theme');
  if (stored === 'dark') return 'dark';
  if (stored === 'light') return 'light';
  return 'system';
}

function applyTheme(theme: ThemeOption) {
  if (theme === 'system') {
    localStorage.removeItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', prefersDark);
  } else if (theme === 'dark') {
    localStorage.setItem('theme', 'dark');
    document.documentElement.classList.add('dark');
  } else {
    localStorage.setItem('theme', 'light');
    document.documentElement.classList.remove('dark');
  }
}

const themeOptions: { value: ThemeOption; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export default function PreferencesSettings() {
  const [theme, setTheme] = useState<ThemeOption>('system');
  const [confirmDeletes, setConfirmDeletes] = useState(true);
  const [autoDownload, setAutoDownload] = useState(false);
  const [showFilePreview, setShowFilePreview] = useState(true);

  useEffect(() => {
    setTheme(getStoredTheme());
    setConfirmDeletes(localStorage.getItem('pref_confirm_delete') !== 'false');
    setAutoDownload(localStorage.getItem('pref_auto_download') === 'true');
    setShowFilePreview(localStorage.getItem('pref_file_preview') !== 'false');
  }, []);

  function handleThemeChange(newTheme: ThemeOption) {
    setTheme(newTheme);
    applyTheme(newTheme);
  }

  function setPref(key: string, value: boolean, setter: (v: boolean) => void) {
    setter(value);
    localStorage.setItem(key, String(value));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Sliders className="size-5 text-primary" />
        <div>
          <h3 className="text-base font-semibold text-foreground">Preferences</h3>
          <p className="text-sm text-muted-foreground">Customize your experience</p>
        </div>
      </div>

      <div className="space-y-3">
        <Label className="text-sm font-medium">Appearance</Label>
        <div className="flex gap-2">
          {themeOptions.map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                onClick={() => handleThemeChange(opt.value)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium transition-all',
                  theme === opt.value
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                )}
              >
                <Icon className="size-4" />
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <Label className="text-sm font-medium">Behavior</Label>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bell className="size-4 text-muted-foreground" />
            <div>
              <p className="text-sm text-foreground">Confirm before deleting</p>
              <p className="text-xs text-muted-foreground">Show a confirmation dialog before permanently deleting files</p>
            </div>
          </div>
          <Switch
            checked={confirmDeletes}
            onCheckedChange={(v: boolean) => setPref('pref_confirm_delete', v, setConfirmDeletes)}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Download className="size-4 text-muted-foreground" />
            <div>
              <p className="text-sm text-foreground">Auto-download after decrypt</p>
              <p className="text-xs text-muted-foreground">Automatically start downloads when decryption completes</p>
            </div>
          </div>
          <Switch
            checked={autoDownload}
            onCheckedChange={(v: boolean) => setPref('pref_auto_download', v, setAutoDownload)}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Eye className="size-4 text-muted-foreground" />
            <div>
              <p className="text-sm text-foreground">File previews</p>
              <p className="text-xs text-muted-foreground">Show inline previews for images and documents</p>
            </div>
          </div>
          <Switch
            checked={showFilePreview}
            onCheckedChange={(v: boolean) => setPref('pref_file_preview', v, setShowFilePreview)}
          />
        </div>
      </div>
    </div>
  );
}
