/**
 * Settings → Cloud (Firebase): connect a project, sign in, verify email,
 * claim ownership, and (owner only) approve staff emails.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Icon, Field, useToast } from './ui.jsx';
import { useSyncStatus } from './SyncIndicator.jsx';
import { useSettings, updateSettings } from '../lib/settings.js';
import { relative } from '../lib/format.js';
import { syncEngine } from '../sync/engine.js';
import {
  getFirebase, getFirebaseConfig, parseFirebaseConfig, getAccess, claimOwnership,
  listStaff, addStaff, removeStaff, refreshVerification,
} from '../sync/firebaseClient.js';
import defaultConfig from '../firebase.config.js';

const AUTH_ERRORS = {
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/invalid-email': 'That email address is not valid.',
  'auth/email-already-in-use': 'An account with this email already exists — sign in instead.',
  'auth/weak-password': 'Use a password with at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
  'auth/network-request-failed': 'No internet connection.',
  'auth/operation-not-allowed': 'Email/Password sign-in is not enabled in the Firebase console.',
  'permission-denied': 'Permission denied — check that firestore.rules is published.',
};
const errText = (e) => AUTH_ERRORS[e?.code] || e?.message || String(e);

function ConfigForm() {
  const toast = useToast();
  const [text, setText] = useState('');
  const save = () => {
    try {
      const cfg = parseFirebaseConfig(text);
      updateSettings((s) => ({ ...s, sync: { ...s.sync, firebaseConfig: cfg } }));
      toast(`Connected to Firebase project ${cfg.projectId}`);
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  return (
    <div className="space-y-3">
      <Field label="Firebase web config" hint="Firebase console → Project settings → Your apps → Web app → Config. Paste the whole block.">
        <textarea className="input font-mono text-xs" rows={7} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={'const firebaseConfig = {\n  apiKey: "…",\n  authDomain: "…",\n  projectId: "…",\n  …\n};'} />
      </Field>
      <button type="button" className="btn-primary" onClick={save}>Connect</button>
    </div>
  );
}

function TeamCard({ fb, ownerEmail }) {
  const toast = useToast();
  const [staff, setStaff] = useState(null);
  const [email, setEmail] = useState('');
  const load = useCallback(() => listStaff(fb).then(setStaff).catch((e) => toast(errText(e), 'error')), [fb, toast]);
  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    try {
      await addStaff(fb, email);
      toast(`${email.trim().toLowerCase()} can now use PureLab`);
      setEmail('');
      load();
    } catch (err) {
      toast(errText(err), 'error');
    }
  };
  const remove = async (addr) => {
    if (!window.confirm(`Remove ${addr}? They lose cloud access immediately.`)) return;
    try {
      await removeStaff(fb, addr);
      load();
    } catch (err) {
      toast(errText(err), 'error');
    }
  };

  return (
    <div className="mt-5 rounded-xl border border-slate-200 p-4">
      <h3 className="font-semibold text-slate-900">Team</h3>
      <p className="mt-0.5 text-sm text-slate-500">
        Staff sign up in PureLab with these emails, verify them, and get access automatically.
      </p>
      <form onSubmit={add} className="mt-3 flex gap-2">
        <input className="input" type="email" placeholder="pharmacist@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button type="submit" className="btn-primary shrink-0"><Icon name="plus" className="h-4 w-4" /> Add</button>
      </form>
      <ul className="mt-3 divide-y divide-slate-100 text-sm">
        <li className="flex items-center justify-between py-2">
          <span>{ownerEmail}</span><span className="badge bg-brand-100 text-brand-800">Owner</span>
        </li>
        {staff === null && <li className="py-2 text-slate-500">Loading…</li>}
        {staff?.map((s) => (
          <li key={s.email} className="flex items-center justify-between py-2">
            <span>{s.email}</span>
            <button type="button" className="text-xs font-semibold text-rose-600 hover:underline" onClick={() => remove(s.email)}>Remove</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AccountPanel({ config }) {
  const toast = useToast();
  const status = useSyncStatus();
  const [fb, setFb] = useState(null);
  const [access, setAccess] = useState(null);
  const [busy, setBusy] = useState(false);
  const [creds, setCreds] = useState({ email: '', password: '' });
  const [loadError, setLoadError] = useState(null);

  const recheck = useCallback(async (client) => {
    try {
      const a = await getAccess(client);
      setAccess(a);
      if (a.state === 'owner' || a.state === 'staff') syncEngine.syncSoon(300);
    } catch (e) {
      setAccess({ state: 'error', error: errText(e) });
    }
  }, []);

  useEffect(() => {
    let unsub = () => {};
    let alive = true;
    setFb(null);
    setAccess(null);
    getFirebase(config)
      .then((client) => {
        if (!alive) return;
        setFb(client);
        unsub = client.authMod.onAuthStateChanged(client.auth, () => recheck(client));
      })
      .catch((e) => alive && setLoadError(errText(e)));
    return () => { alive = false; unsub(); };
  }, [config, recheck]);

  const run = async (fn, okMsg) => {
    setBusy(true);
    try {
      await fn();
      if (okMsg) toast(okMsg);
      await recheck(fb);
    } catch (e) {
      toast(errText(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loadError) return <p className="text-sm text-rose-600">Could not load Firebase: {loadError}</p>;
  if (!fb || !access) return <p className="text-sm text-slate-500">Connecting to Firebase…</p>;

  const { authMod, auth } = fb;
  const cloud = Object.entries(status.remotes).find(([id]) => id.startsWith('firebase:'))?.[1];

  if (access.state === 'signed-out') {
    return (
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => authMod.signInWithEmailAndPassword(auth, creds.email.trim(), creds.password), 'Signed in'); }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <input className="input" type="email" autoComplete="email" placeholder="Email" required value={creds.email} onChange={(e) => setCreds({ ...creds, email: e.target.value })} />
          <input className="input" type="password" autoComplete="current-password" placeholder="Password" required value={creds.password} onChange={(e) => setCreds({ ...creds, password: e.target.value })} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn-primary" disabled={busy}>Sign in</button>
          <button type="button" className="btn-secondary" disabled={busy}
            onClick={() => run(async () => {
              const cred = await authMod.createUserWithEmailAndPassword(auth, creds.email.trim(), creds.password);
              await authMod.sendEmailVerification(cred.user);
            }, 'Account created — check your inbox to verify your email')}>Create account</button>
          <button type="button" className="btn-ghost" disabled={busy || !creds.email}
            onClick={() => run(() => authMod.sendPasswordResetEmail(auth, creds.email.trim()), 'Password reset email sent')}>Forgot password?</button>
        </div>
      </form>
    );
  }

  const signOut = <button type="button" className="btn-secondary btn-sm" onClick={() => authMod.signOut(auth)}>Sign out</button>;
  const email = access.user?.email;

  if (access.state === 'unverified') {
    return (
      <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
        <p>We sent a verification link to <b>{email}</b>. Open it, then come back here.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn-primary btn-sm" disabled={busy}
            onClick={() => run(async () => {
              if (!(await refreshVerification(fb))) throw new Error('Not verified yet — open the link in the email first.');
            }, 'Email verified')}>I've verified my email</button>
          <button type="button" className="btn-secondary btn-sm" disabled={busy}
            onClick={() => run(() => authMod.sendEmailVerification(auth.currentUser), 'Verification email sent again')}>Resend email</button>
          {signOut}
        </div>
      </div>
    );
  }

  if (access.state === 'no-owner') {
    return (
      <div className="rounded-lg bg-sky-50 p-4 text-sm text-sky-900">
        <p>Signed in as <b>{email}</b>. This Firebase project has no owner yet.</p>
        <p className="mt-1">The owner can see everything and decides which staff emails may sign in. This can't be changed later.</p>
        <div className="mt-3 flex gap-2">
          <button type="button" className="btn-primary btn-sm" disabled={busy}
            onClick={() => run(() => claimOwnership(fb), 'You are now the owner')}>Claim ownership</button>
          {signOut}
        </div>
      </div>
    );
  }

  if (access.state === 'pending') {
    return (
      <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
        <p>Signed in as <b>{email}</b>, but this account hasn't been approved yet.</p>
        <p className="mt-1">Ask the owner to add <b>{email}</b> in Settings → Cloud → Team, then tap Check again.</p>
        <div className="mt-3 flex gap-2">
          <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={() => run(async () => {}, null)}>Check again</button>
          {signOut}
        </div>
      </div>
    );
  }

  if (access.state === 'error') {
    return <div className="rounded-lg bg-rose-50 p-4 text-sm text-rose-800">{access.error} <div className="mt-2">{signOut}</div></div>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        <span>
          Signed in as <b>{email}</b> · {access.state === 'owner' ? 'Owner' : 'Staff'}
          {cloud && <> · {cloud.ok ? `synced ${relative(cloud.lastSyncAt)}` : cloud.error || 'syncing…'}</>}
        </span>
        {signOut}
      </div>
      {access.state === 'owner' && <TeamCard fb={fb} ownerEmail={access.owner.email} />}
    </div>
  );
}

export default function CloudPanel() {
  const s = useSettings();
  const config = getFirebaseConfig();
  const usingOverride = !!s.sync.firebaseConfig?.apiKey;

  return (
    <section className="card p-4 sm:p-6">
      <h2 className="text-base font-semibold text-slate-900">Cloud (Firebase)</h2>
      <p className="mt-0.5 text-sm text-slate-500">
        Syncs products, customers, invoices and stock with Firestore whenever this device is online. Only the owner and approved staff can see the data.
      </p>
      <div className="mt-4">
        {!config ? <ConfigForm /> : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <Icon name="cloud" className="h-4 w-4" /> Project <b className="text-slate-700">{config.projectId}</b>
              {usingOverride && (
                <button type="button" className="text-brand-700 hover:underline"
                  onClick={() => updateSettings((cur) => ({ ...cur, sync: { ...cur.sync, firebaseConfig: null } }))}>
                  {defaultConfig ? 'use built-in project' : 'disconnect'}
                </button>
              )}
            </div>
            <AccountPanel config={config} />
          </>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={s.sync.autoSync}
              onChange={(e) => updateSettings((cur) => ({ ...cur, sync: { ...cur.sync, autoSync: e.target.checked } }))} /> Auto-sync
          </label>
          <label className="flex items-center gap-2">every
            <input className="input w-20" inputMode="numeric" value={s.sync.intervalSec}
              onChange={(e) => updateSettings((cur) => ({ ...cur, sync: { ...cur.sync, intervalSec: Number(e.target.value) || 60 } }))} /> s
          </label>
          <button type="button" className="btn-secondary btn-sm" onClick={() => syncEngine.syncNow()}><Icon name="refresh" className="h-4 w-4" /> Sync now</button>
        </div>
      </div>
    </section>
  );
}
