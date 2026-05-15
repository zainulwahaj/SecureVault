'use client';

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { Shield } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { ExpandableTabs, type TabItem } from '@/components/ui/expandable-tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import {
  Folder,
  FolderTree,
  Share2,
  Trash2,
  ClipboardList,
  Settings,
  LogOut,
  HardDrive,
  Bell,
} from 'lucide-react';

const navItems = [
  { id: 'my-files', title: 'All Files', icon: Folder },
  { id: 'explorer', title: 'Explorer', icon: FolderTree },
  { id: 'shared', title: 'Shared', icon: Share2 },
  { id: 'trash', title: 'Trash', icon: Trash2 },
  { type: 'separator' as const },
  { id: 'activity', title: 'Activity', icon: ClipboardList },
  { id: 'security', title: 'Settings', icon: Settings },
];

const tabItems: TabItem[] = navItems.map((item) => {
  if ('type' in item && item.type === 'separator') {
    return { type: 'separator' as const };
  }
  return { title: item.title!, icon: item.icon! };
});

const navIds = navItems.filter((n) => !('type' in n && n.type === 'separator')).map((n) => n.id!);

function tabIndexToViewId(tabIndex: number | null): string | null {
  if (tabIndex === null) return null;
  const item = navItems[tabIndex];
  if (!item || ('type' in item && item.type === 'separator')) return null;
  return item.id!;
}

function viewIdToTabIndex(viewId: string): number | null {
  for (let i = 0; i < navItems.length; i++) {
    if (!('type' in navItems[i]) && navItems[i].id === viewId) return i;
  }
  return null;
}

function formatStorageSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

interface AppNavbarProps {
  activeView: string;
  onNavigate: (view: string) => void;
  onLogout: () => void;
  storageUsed?: number;
  fileCount?: number;
}

export function AppNavbar({
  activeView,
  onNavigate,
  onLogout,
  storageUsed = 0,
  fileCount = 0,
}: AppNavbarProps) {
  const { user } = useAuth();

  const initials = user?.displayName
    ? user.displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : user?.email
      ? user.email.split('@')[0].slice(0, 2).toUpperCase()
      : '??';

  const username = user?.displayName || (user?.email ? user.email.split('@')[0] : 'User');
  const storageLimit = 10 * 1024 * 1024 * 1024;
  const storagePercent = Math.min((storageUsed / storageLimit) * 100, 100);

  const handleTabChange = (index: number | null) => {
    const viewId = tabIndexToViewId(index);
    if (viewId) onNavigate(viewId);
  };

  return (
    <header className="sticky top-0 z-30 w-full border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-screen-2xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-3 shrink-0">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div
              className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground"
              style={{ boxShadow: '0 0 20px oklch(from var(--primary) l c h / 0.35)' }}
            >
              <Shield size={16} strokeWidth={2.2} />
            </div>
            <div className="font-mono text-[14px] font-semibold tracking-[-0.02em] hidden sm:block">
              secure<span className="text-primary">vault</span>
            </div>
          </Link>
          <div className="hidden lg:flex items-center gap-2 ml-3 pl-3 border-l border-border font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground/80">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 a-pulse" />
            TLS 1.3
          </div>
        </div>

        <div className="hidden md:flex items-center justify-center flex-1">
          <ExpandableTabs
            tabs={tabItems}
            activeColor="text-primary"
            activeIndex={viewIdToTabIndex(activeView)}
            onChange={handleTabChange}
          />
        </div>

        <div className="flex md:hidden items-center gap-1">
          {navIds.map((id) => {
            const item = navItems.find((n) => n.id === id)!;
            const Icon = item.icon!;
            return (
              <Button
                key={id}
                variant={activeView === id ? 'secondary' : 'ghost'}
                size="icon-sm"
                onClick={() => onNavigate(id)}
                className="text-muted-foreground"
              >
                <Icon className="size-4" />
              </Button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button variant="ghost" size="icon-sm" className="text-muted-foreground">
            <Bell className="size-4" />
          </Button>
          <ThemeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button className="relative flex h-9 w-9 items-center justify-center rounded-full hover:bg-accent transition-colors">
                  <Avatar className="size-8 ring-2 ring-primary/10">
                    {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.displayName || user.email} />}
                    <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </button>
              }
            />
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium capitalize">{username}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="px-2 py-2 space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <HardDrive className="size-3.5" />
                  <span>Storage</span>
                </div>
                <Progress value={storagePercent} className="h-1.5" />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {formatStorageSize(storageUsed)} used
                  </p>
                  <p className="text-xs text-muted-foreground/60">
                    {fileCount} file{fileCount !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onLogout}
                className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
              >
                <LogOut className="size-4 mr-2" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
