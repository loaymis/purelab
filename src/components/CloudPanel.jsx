/**
 * Settings → Cloud & Team: Firebase connection, account status, and (owner only)
 * the staff allow-list. Sign-in steps are shared with the Welcome screen.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Icon, Field, Avatar, useToast, useConfirm } from './ui.jsx';
import { useSyncStatus } from './SyncIndicator.jsx';
import { AccountSteps } from '../pages/Welcome.jsx';
import { useSettings, updateSettings } from '../lib/settings.js';
import { relative } from '../lib/format.js';
import { syncEngine } from '../sync/engine.js';
import { parseFirebaseConfig, getFirebaseConfig, listStaff, addStaff, removeStaff } from '../sync/firebaseClient.js';
import { useCloudAccount, signOut, authErrorText } from '../hooks/useCloudAccount.js';
import defaultConfig from '../firebase.config.js';
import { useT } from '../i18n/index.js';

function ConfigForm() {
  const t = useT();
  const toast = useToast();
  const [text, setText] = useState('');
  const save = () => {
    try {
      const cfg = parseFirebaseConfig(text);
      updateSettings((s) => ({ ...s, sync: { ...s.sync, firebaseConfig: cfg } }));
      toast(t('Connected to Firebase project {id}', { id: cfg.projectId }));
    } catch (e) {
      toast(t(e.message), 'error');
    }
  };
  return (
    <div className="space-y-3">
      <Field label={t('Firebase web config')} hint={t('Firebase console → Project settings → Your apps → Web app → Config.')}>
        <textarea className="input font-mono text-xs" dir="ltr" rows={7} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={'const firebaseConfig = {\n  apiKey: "…",\n  authDomain: "…",\n  projectId: "…",\n  …\n};'} />
      </Field>
      <button type="button" className="btn-primary" onClick={save}>{t('Connect')}</button>
    </div>
  );
}

function TeamCard({ fb, ownerEmail }) {
  const t = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const [staff, setStaff] = useState(null);
  const [email, setEmail] = useState('');
  const load = useCallback(() => listStaff(fb).then(setStaff).catch((e) => toast(authErrorText(e, t), 'error')), [fb, toast, t]);
  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    try {
      await addStaff(fb, email);
      toast(t('{email} can now sign in', { email: email.trim().toLowerCase() }));
      setEmail('');
      load();
    } catch (err) {
      toast(authErrorText(err, t), 'error');
    }
  };
  const remove = async (addr) => {
    if (!(await confirm({ title: t('Remove staff member'), message: t('Remove {email}? They lose access immediately.', { email: addr }), danger: true, confirmLabel: t('Remove') }))) return;
    try { await removeStaff(fb, addr); load(); } catch (err) { toast(authErrorText(err, t), 'error'); }
  };

  return (
    <section className="card p-4 sm:p-6">
      <h2 className="text-base font-semibold text-ink">{t('Team')}</h2>
      <p className="mt-0.5 text-sm text-muted">{t('Staff create an account with one of these emails, verify it, and get access automatically.')}</p>
      <form onSubmit={add} className="mt-4 flex gap-2">
        <input className="input" type="email" dir="ltr" required placeholder="pharmacist@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button type="submit" className="btn-primary shrink-0"><Icon name="plus" className="h-4 w-4" />{t('Add')}</button>
      </form>
      <ul className="mt-4 divide-y divide-line rounded-2xl border border-line">
        <li className="flex items-center gap-3 px-3 py-2.5">
          <Avatar name={ownerEmail} size="h-8 w-8 text-xs" /><span className="flex-1 truncate text-sm text-ink">{ownerEmail}</span>
          <span className="badge bg-brand-500/15 text-accent">{t('Owner')}</span>
        </li>
        {staff === null && <li className="px-3 py-3 text-sm text-faint">{t('Loading…')}</li>}
        {staff?.map((s) => (
          <li key={s.email} className="flex items-center gap-3 px-3 py-2.5">
            <Avatar name={s.email} size="h-8 w-8 text-xs" /><span className="flex-1 truncate text-sm text-ink">{s.email}</span>
            <button type="button" className="text-xs font-semibold text-rose-600 hover:underline" onClick={() => remove(s.email)}>{t('Remove')}</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function CloudPanel() {
  const t = useT();
  const s = useSettings();
  const account = useCloudAccount();
  const status = useSyncStatus();
  const config = getFirebaseConfig();
  const usingOverride = !!s.sync.firebaseConfig?.apiKey;
  const member = account.state === 'owner' || account.state === 'staff';
  const cloud = Object.entries(status.remotes).find(([id]) => id.startsWith('firebase:'))?.[1];

  return (
    <div className="space-y-5">
      <section className="card p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink">{t('Cloud sync')}</h2>
            <p className="mt-0.5 text-sm text-muted">{t('Products, customers, invoices and stock sync with Firebase whenever this device is online.')}</p>
          </div>
          {config && (
            <span className="badge bg-subtle text-muted" dir="ltr"><Icon name="cloud" className="h-3.5 w-3.5" />{config.projectId}</span>
          )}
        </div>
        <div className="mt-5">
          {!config ? <ConfigForm /> : member ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-emerald-500/10 p-4">
                <Avatar name={account.user.email} />
                <div className="min-w-[12rem] flex-1">
                  <div className="truncate font-semibold text-ink">{account.user.email}</div>
                  <div className="text-sm text-emerald-700 dark:text-emerald-300">
                    {account.state === 'owner' ? t('Owner') : t('Staff')} · {cloud?.ok ? t('synced {when}', { when: relative(cloud.lastSyncAt) }) : cloud?.error ? t(cloud.error) : t('Syncing…')}
                  </div>
                </div>
                <button type="button" className="btn-secondary btn-sm" onClick={() => syncEngine.syncNow()}><Icon name="refresh" className="h-4 w-4" />{t('Sync now')}</button>
                <button type="button" className="btn-ghost btn-sm text-rose-600" onClick={() => signOut()}>{t('Sign out')}</button>
              </div>
            </div>
          ) : account.state === 'loading' ? <p className="text-sm text-muted">{t('Connecting…')}</p> : (
            <div className="mx-auto max-w-sm"><AccountSteps /></div>
          )}
          {usingOverride && (
            <button type="button" className="mt-4 text-xs font-semibold text-accent hover:underline"
              onClick={() => updateSettings((cur) => ({ ...cur, sync: { ...cur.sync, firebaseConfig: null } }))}>
              {defaultConfig ? t('Use the built-in project') : t('Disconnect this project')}
            </button>
          )}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-line pt-4 text-sm text-muted">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={s.sync.autoSync}
              onChange={(e) => updateSettings((cur) => ({ ...cur, sync: { ...cur.sync, autoSync: e.target.checked } }))} />{t('Auto-sync')}
          </label>
          <label className="flex items-center gap-2">{t('every')}
            <input className="input min-h-[36px] w-20" inputMode="numeric" value={s.sync.intervalSec}
              onChange={(e) => updateSettings((cur) => ({ ...cur, sync: { ...cur.sync, intervalSec: Number(e.target.value) || 60 } }))} />{t('seconds')}
          </label>
        </div>
      </section>
      {account.state === 'owner' && account.fb && <TeamCard fb={account.fb} ownerEmail={account.owner?.email || account.user.email} />}
    </div>
  );
}
