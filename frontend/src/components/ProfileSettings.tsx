'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { updateProfile } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { User, Mail, Camera, Check, X, Upload, Trash2 } from 'lucide-react';

function resizeImage(file: File, maxSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width;
        let h = img.height;
        if (w > maxSize || h > maxSize) {
          if (w > h) { h = (h / w) * maxSize; w = maxSize; }
          else { w = (w / h) * maxSize; h = maxSize; }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ProfileSettings() {
  const { user, refreshUser } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
      setAvatarUrl(user.avatarUrl || '');
    }
  }, [user]);

  const initials = displayName
    ? displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : user?.email
      ? user.email.split('@')[0].slice(0, 2).toUpperCase()
      : '??';

  const isDirty =
    displayName !== (user?.displayName || '') ||
    avatarUrl !== (user?.avatarUrl || '');

  async function handleAvatarSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5 MB');
      return;
    }

    try {
      const dataUrl = await resizeImage(file, 256);
      setAvatarUrl(dataUrl);
    } catch {
      setError('Failed to process image');
    }

    e.target.value = '';
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(false);

    const result = await updateProfile({
      displayName: displayName || null,
      avatarUrl: avatarUrl || null,
    });

    if (result.success) {
      await refreshUser();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } else {
      setError(result.error || 'Failed to update profile');
    }
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <User className="size-5 text-primary" />
        <div>
          <h3 className="text-base font-semibold text-foreground">Profile</h3>
          <p className="text-sm text-muted-foreground">Manage your personal information</p>
        </div>
      </div>

      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarSelect}
      />

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
        <div className="flex flex-col items-center gap-2">
          <div
            className="relative group cursor-pointer"
            onClick={() => avatarInputRef.current?.click()}
          >
            <Avatar className="size-20 ring-4 ring-primary/10">
              {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName || 'Avatar'} />}
              <AvatarFallback className="text-xl font-semibold bg-primary/10 text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera className="size-5 text-white" />
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => avatarInputRef.current?.click()}
            >
              <Upload className="size-3 mr-1" />
              Upload
            </Button>
            {avatarUrl && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-destructive hover:text-destructive"
                onClick={() => setAvatarUrl('')}
              >
                <Trash2 className="size-3 mr-1" />
                Remove
              </Button>
            )}
          </div>
        </div>

        <div className="flex-1 space-y-1">
          <p className="text-sm font-medium text-foreground">
            {user?.displayName || user?.email?.split('@')[0]}
          </p>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
          <p className="text-xs text-muted-foreground">
            Member since {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '—'}
          </p>
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="display-name">Display name</Label>
          <Input
            id="display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Enter your name"
            maxLength={100}
          />
          <p className="text-xs text-muted-foreground">
            This is how your name will appear across the app.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              id="email"
              value={user?.email || ''}
              disabled
              className="pl-10 opacity-60"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Email cannot be changed for security reasons.
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="hover:opacity-70"><X className="size-4" /></button>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/5 px-4 py-3 text-sm text-green-700 dark:text-green-400">
          <Check className="size-4" />
          Profile updated successfully.
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || !isDirty}>
          {saving ? <><Spinner className="size-4 mr-2" /> Saving...</> : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}
