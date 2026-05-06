'use client';

import { useAuth } from '@/context/AuthContext';
import { Logo } from '@/components/ui/Logo';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  LayoutDashboard,
  Folder,
  Share2,
  Trash2,
  ClipboardList,
  Settings,
  LogOut,
  ChevronRight,
  HardDrive,
} from 'lucide-react';
import { motion } from 'framer-motion';

const navItems = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'my-files', label: 'All Files', icon: Folder },
  { id: 'shared', label: 'Shared Files', icon: Share2 },
  { id: 'trash', label: 'Trash', icon: Trash2 },
  { id: 'activity', label: 'Activity', icon: ClipboardList },
  { id: 'security', label: 'Settings', icon: Settings },
];

interface AppSidebarProps {
  activeView: string;
  onNavigate: (view: string) => void;
  onLogout: () => void;
  storageUsed?: number;
  fileCount?: number;
}

function formatStorageSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function AppSidebar({
  activeView,
  onNavigate,
  onLogout,
  storageUsed = 0,
  fileCount = 0,
}: AppSidebarProps) {
  const { user } = useAuth();
  const { isMobile, setOpenMobile } = useSidebar();

  const initials = user?.email
    ? user.email.split('@')[0].slice(0, 2).toUpperCase()
    : '??';

  const username = user?.email ? user.email.split('@')[0] : 'User';

  const storageLimit = 10 * 1024 * 1024 * 1024;
  const storagePercent = Math.min((storageUsed / storageLimit) * 100, 100);

  const handleNavigate = (view: string) => {
    onNavigate(view);
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
          <Logo size="sm" />
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup className="pt-3">
          <div className="flex items-center gap-3 px-3 py-2 mb-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            <Avatar className="size-9 shrink-0 ring-2 ring-primary/10">
              <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <p className="text-sm font-semibold text-foreground truncate capitalize">
                {username}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {user?.email}
              </p>
            </div>
            <ChevronRight className="size-4 text-muted-foreground/50 shrink-0 group-data-[collapsible=icon]:hidden" />
          </div>

          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = activeView === item.id;
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => handleNavigate(item.id)}
                      tooltip={item.label}
                      className="relative"
                    >
                      <item.icon className="size-4" />
                      <span>{item.label}</span>
                      {isActive && (
                        <motion.div
                          layoutId="sidebar-active-indicator"
                          className="absolute inset-0 rounded-md bg-sidebar-accent"
                          style={{ zIndex: -1 }}
                          transition={{
                            type: 'spring',
                            stiffness: 350,
                            damping: 30,
                          }}
                        />
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <div className="flex-1" />

        <SidebarGroup>
          <SidebarGroupLabel className="gap-2">
            <HardDrive className="size-3.5" />
            Storage
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <div className="px-2 py-1.5 space-y-2.5 group-data-[collapsible=icon]:hidden">
              <Progress
                value={storagePercent}
                className="h-2"
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {formatStorageSize(storageUsed)} used
                </p>
                <p className="text-xs text-muted-foreground/60">
                  {fileCount} file{fileCount !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarSeparator />
        <div className="p-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={onLogout}
                tooltip="Sign Out"
                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="size-4" />
                <span>Sign Out</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
