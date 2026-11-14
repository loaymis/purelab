/** Online/offline + sync status pill with a "sync now" action. */
import React, { useEffect, useState } from 'react';
import { syncEngine } from '../sync/engine.js';
import { Icon } from './ui.jsx';
import { relative } from '../lib/format.js';

export function useSyncStatus() {
  const [status, setStatus] = useState(syncEngine.getStatus());
  useEffect(() => syncEngine.subscribe(setStatus), []);
  return status;
}

export default function SyncIndicator({ compact = false }) {
  const s = useSyncStatus();
  const remotes = Object.values(s.remotes);
  const pending = remotes.reduce((n, r) => Math.max(n, r.pending || 0), 0);
  const failing = remotes.filter((r) => r.ok === false);
  const anyOk = remotes.some((r) => r.ok);

  let tone = 'bg-slate-100 text-slate-600';
  let icon = 'cloudOff';
  let text = 'Local only';
  if (remotes.length) {
    if (s.syncing) { tone = 'bg-sky-100 text-sky-800'; icon = 'refresh'; text = 'Syncing…'; }
    else if (failing.length && !anyOk) {
      // Distinguish "can't reach the server" from "reachable, but this account can't sync yet".
      const needsAccount = failing.some((r) => /sign|verify|owner|approve/i.test(r.error || ''));
      tone = 'bg-amber-100 text-amber-800';
      icon = 'cloudOff';
      text = !s.online ? 'Offline' : needsAccount ? 'Sign in to sync' : 'Not synced';
    }
    else if (pending > 0) { tone = 'bg-amber-100 text-amber-800'; icon = 'cloud'; text = `${pending} pending`; }
    else { tone = 'bg-emerald-100 text-emerald-800'; icon = 'cloud'; text = 'Synced'; }
  }
  const title = remotes.length
    ? remotes.map((r) => `${r.label}: ${r.ok ? `ok (${relative(r.lastSyncAt)})` : r.error || 'waiting'}${r.pending ? `, ${r.pending} pending` : ''}`).join('\n')
    : 'No sync target configured — data is stored on this device only. Configure sync in Settings.';

  return (
    <button type="button" title={title} onClick={() => syncEngine.syncNow()}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${tone}`}>
      <Icon name={icon} className={`h-4 w-4 ${s.syncing ? 'animate-spin' : ''}`} />
      {!compact && <span>{text}</span>}
      {!s.online && !compact && <span className="opacity-70">· no internet</span>}
    </button>
  );
}
