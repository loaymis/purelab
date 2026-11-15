/** Avatar button + popover: account, sync status, theme, language, install, sign out. */
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, Avatar, Segmented } from './ui.jsx';
import InstallButton from './InstallButton.jsx';
import { useSyncStatus } from './SyncIndicator.jsx';
import { useT, LANGUAGES } from '../i18n/index.js';
import { useSettings, updateSettings } from '../lib/settings.js';
import { relative } from '../lib/format.js';
import { useCloudAccount, signOut } from '../hooks/useCloudAccount.js';
import { syncEngine } from '../sync/engine.js';

export default function AccountMenu({ placement = 'down', showName = false }) {
  const t = useT();
  const s = useSettings();
  const account = useCloudAccount();
  const status = useSyncStatus();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const email = account.user?.email;
  const role = account.state === 'owner' ? t('Owner') : account.state === 'staff' ? t('Staff') : null;
  const name = email || s.company.name;
  const remotes = Object.values(status.remotes);
  const setA = (patch) => updateSettings((cur) => ({ ...cur, appearance: { ...cur.appearance, ...patch } }));

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={t('Account')}
        className={`flex items-center gap-2.5 rounded-xl text-start transition ${showName ? 'w-full p-2 hover:bg-white/10' : 'p-0.5'}`}>
        <Avatar name={name} size={showName ? 'h-9 w-9 text-sm' : 'h-9 w-9 text-sm'} />
        {showName && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-white">{email || t('Not signed in')}</span>
            <span className="block truncate text-xs text-brand-300">{role || t('This device only')}</span>
          </span>
        )}
        {showName && <Icon name="more" className="h-4 w-4 text-brand-300" />}
      </button>

      {open && (
        <div className={`absolute z-50 w-72 rounded-2xl border border-line bg-surface p-2 text-ink shadow-pop animate-fade-in ${
          placement === 'up' ? 'bottom-full start-0 mb-2' : 'end-0 top-full mt-2'}`}>
          <div className="flex items-center gap-3 px-2 py-2">
            <Avatar name={name} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{email || t('Not signed in')}</div>
              <div className="flex items-center gap-1.5 text-xs text-muted">
                {role && <span className="badge bg-brand-500/15 text-accent">{role}</span>}
                <span>{t('Device {code}', { code: s.deviceCode })}</span>
              </div>
            </div>
          </div>

          <button type="button" onClick={() => syncEngine.syncNow()}
            className="mx-1 my-1 flex w-[calc(100%-0.5rem)] items-center gap-2 rounded-xl bg-subtle px-3 py-2 text-start text-xs text-muted">
            <Icon name={status.syncing ? 'refresh' : remotes.some((r) => r.ok) ? 'cloud' : 'cloudOff'} className={`h-4 w-4 ${status.syncing ? 'animate-spin' : ''}`} />
            <span className="flex-1">
              {remotes.length === 0 ? t('Saved on this device only')
                : remotes.map((r) => `${t(r.label)}: ${r.ok ? t('synced {when}', { when: relative(r.lastSyncAt) }) : t(r.error || 'waiting')}`).join(' · ')}
            </span>
            <Icon name="refresh" className="h-3.5 w-3.5" />
          </button>

          <div className="space-y-2 border-t border-line px-2 py-3">
            <Segmented size="sm" ariaLabel={t('Theme')} value={s.appearance.theme} onChange={(theme) => setA({ theme })} options={[
              { value: 'auto', label: t('Auto'), icon: 'monitor' },
              { value: 'light', label: t('Light'), icon: 'sun' },
              { value: 'dark', label: t('Dark'), icon: 'moon' },
            ]} />
            <Segmented size="sm" ariaLabel={t('Language')} value={s.appearance.language} onChange={(language) => setA({ language })}
              options={LANGUAGES.map((l) => ({ value: l.id, label: l.label }))} />
          </div>

          <div className="border-t border-line pt-1">
            <Link to="/settings" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-subtle">
              <Icon name="settings" className="h-4 w-4 text-muted" />{t('Settings')}
            </Link>
            <InstallButton variant="menu" onDone={() => setOpen(false)} />
            {account.state === 'disabled' ? null : email ? (
              <button type="button" onClick={() => { setOpen(false); signOut(); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start text-sm text-rose-600 hover:bg-rose-500/10">
                <Icon name="logout" className="h-4 w-4" />{t('Sign out')}
              </button>
            ) : (
              <button type="button" onClick={() => { setOpen(false); updateSettings({ offlineMode: false, cloudBannerDismissed: false }); }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start text-sm text-accent hover:bg-subtle">
                <Icon name="cloud" className="h-4 w-4" />{t('Sign in to sync')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
