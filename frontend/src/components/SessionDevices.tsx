'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import * as api from '@/lib/api';
import type { SessionDevice } from '@/types';
import { MonitorSmartphone, RefreshCw, ShieldAlert } from 'lucide-react';

function formatWhen(value: string | null): string {
  if (!value) return 'unknown';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'unknown';
  return d.toLocaleString();
}

function browserLabel(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Edg/')) return 'Edge';
  if (userAgent.includes('Chrome')) return 'Chrome';
  if (userAgent.includes('Safari')) return 'Safari';
  return userAgent.slice(0, 42);
}

export default function SessionDevices() {
  const [sessions, setSessions] = useState<SessionDevice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRevoking, setIsRevoking] = useState(false);

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    const result = await api.listSessions();
    if (result.success && result.data) {
      setSessions(result.data.sessions);
    } else {
      toast.error('Failed to load sessions', { description: result.error });
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const revokeOtherSessions = async () => {
    setIsRevoking(true);
    const result = await api.revokeAllSessions(true);
    if (result.success && result.data) {
      toast.success(`Revoked ${result.data.revokedCount} session${result.data.revokedCount === 1 ? '' : 's'}`);
      await loadSessions();
    } else {
      toast.error('Failed to revoke sessions', { description: result.error });
    }
    setIsRevoking(false);
  };

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
            <MonitorSmartphone className="size-5 text-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Active Sessions</h3>
            <p className="text-sm text-muted-foreground">Review devices with access to your account</p>
          </div>
        </div>
        <Button variant="outline" size="icon-sm" onClick={loadSessions} disabled={isLoading}>
          <RefreshCw className={`size-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner className="size-5" />
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active sessions found.</p>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {sessions.map((session) => (
            <div key={session.sessionIdHash} className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{browserLabel(session.userAgent)}</span>
                  {session.current && <Badge variant="outline">Current</Badge>}
                  <Badge variant={session.authLevel === 'full' ? 'secondary' : 'destructive'}>{session.authLevel}</Badge>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {session.ipAddress || 'unknown IP'} · last seen {formatWhen(session.lastSeenAt)}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  Session {session.sessionIdHash.slice(0, 12)} · created {formatWhen(session.createdAt)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Revoke other devices</p>
          <p className="text-xs text-muted-foreground">This signs out every other active session while keeping this browser connected.</p>
        </div>
        <Button variant="outline" size="sm" onClick={revokeOtherSessions} disabled={isRevoking}>
          {isRevoking ? <Spinner className="mr-2 size-3.5" /> : null}
          Revoke Others
        </Button>
      </div>
    </div>
  );
}
