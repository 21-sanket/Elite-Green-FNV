'use client';

import { useEffect, useState } from 'react';
import { pendingCount, syncAll, type SyncStatus } from '@/src/lib/sync';
import { useI18n } from '@/src/lib/i18n';

const statusConfig: Record<SyncStatus, { color: string; icon: string }> = {
  synced: { color: 'bg-emerald-500', icon: '✓' },
  pending: { color: 'bg-amber-500', icon: '↻' },
  failed: { color: 'bg-red-500', icon: '✕' },
};

interface StatusBadgeProps {
  status: SyncStatus;
  className?: string;
}

/** Shows sync status for a single record */
export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const { t } = useI18n();
  const config = statusConfig[status];
  const label = status === 'synced' ? t.common.sync_sent
    : status === 'pending' ? t.common.sync_saved
    : t.common.sync_failed;

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs
      font-medium text-white ${config.color} ${className}`}>
      <span>{config.icon}</span>
      <span>{label}</span>
    </span>
  );
}

/** Global sync indicator in the nav bar */
export function SyncIndicator() {
  const [count, setCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const check = async () => setCount(await pendingCount());
    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await syncAll();
      setCount(await pendingCount());
      console.log('Sync result:', result);
    } finally {
      setSyncing(false);
    }
  };

  if (count === 0) return null;

  return (
    <button
      onClick={handleSync}
      disabled={syncing}
      className="flex items-center gap-1.5 rounded-full bg-amber-500/20 px-3 py-1.5
                 text-sm font-medium text-amber-400 transition-all hover:bg-amber-500/30
                 active:scale-95 disabled:opacity-50"
    >
      <span className={syncing ? 'animate-spin' : ''}>↻</span>
      <span>{count}</span>
    </button>
  );
}
