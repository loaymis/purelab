/** Online/offline + sync status pill with a "sync now" action. */
import React, { useEffect, useState } from 'react';
import { syncEngine } from '../sync/engine.js';
import { Icon } from './ui.jsx';
import { relative } from '../lib/format.js';
import { useT } from '../i18n/index.js';

export function useSyncStatus() {
  const [status, setStatus] = useState(syncEngine.getStatus());
  useEffect(() => syncEngine.subscribe(setStatus), []);
  return status;
}

export default function SyncIndicator({ compact = false, onDark = false }) {
  const t = useT();
  const s = useSyncStatus();
  const remotes = Object.values(s.remotes);
  const pending = remotes.reduce((n, r) => Math.max(n, r.pending || 0), 0);
  const failing = remotes.filter((r) => r.ok === false);
  const anyOk = remotes.some((r) => r.ok);

  let tone = onDark ? 'bg-white/10 text-brand-100' : 'bg-subtle text-muted';
  let icon = 'cloudOff';
  let text = t('This device');
  if (!s.online) { tone = 'bg-amber-500/15 text-amber-700 dark:text-amber-300'; text = t('Offline'); }
  else if (remotes.length) {
    if (s.syncing) { tone = 'bg-sky-500/15 text-sky-700 dark:text-sky-300'; icon = 'refresh'; text = t('Syncing…'); }
    else if (failing.length && !anyOk) {
      const needsAccount = failing.some((r) => /sign|verify|owner|approve/i.test(r.error || ''));
      tone = 'bg-amber-500/15 text-amber-700 dark:text-amber-300';
      text = needsAccount ? t('Sign in to sync') : t('Not synced');
    } else if (pending > 0) { tone = 'bg-amber-500/15 text-amber-700 dark:text-amber-300'; icon = 'cloud'; text = t('{n} pending', { n: pending }); }
    else { tone = onDark ? 'bg-emerald-400/15 text-emerald-200' : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'; icon = 'cloud'; text = t('Synced'); }
  }
  const title = remotes.length
    ? remotes.map((r) => `${t(r.label)}: ${r.ok ? t('synced {when}', { when: relative(r.lastSyncAt) }) : t(r.error || 'waiting')}${r.pending ? ` · ${t('{n} pending', { n: r.pending })}` : ''}`).join('\n')
    : t('Saved on this device only');

  return (
    <button type="button" title={title} onClick={() => syncEngine.syncNow()}
      className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition ${tone}`}>
      <Icon name={icon} className={`h-4 w-4 ${s.syncing ? 'animate-spin' : ''}`} />
      {!compact && <span>{text}</span>}
    </button>
  );
}
