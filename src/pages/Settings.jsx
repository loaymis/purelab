/** Settings: company branding, invoicing, cloud sync, LAN hub pairing, data tools. */
import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Icon, Field, PageHeader, useToast } from '../components/ui.jsx';
import { useSyncStatus } from '../components/SyncIndicator.jsx';
import { useSettings, updateSettings } from '../lib/settings.js';
import { resetFormatCache, relative } from '../lib/format.js';
import { desktop, isDesktop } from '../lib/platform.js';
import { getSupabase } from '../sync/supabaseAdapter.js';
import { syncEngine } from '../sync/engine.js';
import { exportBackup, importBackup } from '../db/repo.js';
import { loadDemoData } from '../lib/demo.js';

function Section({ title, description, children }) {
  return (
    <section className="card p-4 sm:p-6">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function CompanySection() {
  const s = useSettings();
  const setCo = (k) => (e) => updateSettings((cur) => ({ ...cur, company: { ...cur.company, [k]: e.target.value } }));
  return (
    <Section title="Company & branding" description="Printed on every invoice and receipt.">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Business name"><input className="input" value={s.company.name} onChange={setCo('name')} /></Field>
        <Field label="Tagline"><input className="input" value={s.company.tagline} onChange={setCo('tagline')} /></Field>
        <Field label="Address" className="sm:col-span-2"><textarea className="input" rows={2} value={s.company.address} onChange={setCo('address')} /></Field>
        <Field label="Phone"><input className="input" value={s.company.phone} onChange={setCo('phone')} /></Field>
        <Field label="Email"><input className="input" value={s.company.email} onChange={setCo('email')} /></Field>
        <Field label="Website"><input className="input" value={s.company.website} onChange={setCo('website')} /></Field>
        <Field label="Tax / VAT ID"><input className="input" value={s.company.taxId} onChange={setCo('taxId')} /></Field>
        <Field label="Pharmacy / manufacturing licence"><input className="input" value={s.company.license} onChange={setCo('license')} /></Field>
      </div>
    </Section>
  );
}

function InvoicingSection() {
  const s = useSettings();
  const set = (k, num = false) => (e) => updateSettings({ [k]: num ? Number(e.target.value) || 0 : e.target.value });
  return (
    <Section title="Invoicing" description={`Invoice numbers on this device: ${s.invoicePrefix}-${s.deviceCode}-000001 (unique per device, safe offline).`}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Currency (ISO code)">
          <input className="input uppercase" maxLength={3} value={s.currency}
            onChange={(e) => { updateSettings({ currency: e.target.value.toUpperCase() }); resetFormatCache(); }} />
        </Field>
        <Field label="Locale"><input className="input" value={s.locale} onChange={(e) => { updateSettings({ locale: e.target.value }); resetFormatCache(); }} /></Field>
        <Field label="Invoice prefix"><input className="input uppercase" value={s.invoicePrefix} onChange={(e) => updateSettings({ invoicePrefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} /></Field>
        <Field label="Default VAT %"><input className="input" inputMode="decimal" value={s.defaultTaxRate} onChange={set('defaultTaxRate', true)} /></Field>
        <Field label="Payment terms (days)"><input className="input" inputMode="numeric" value={s.paymentTermsDays} onChange={set('paymentTermsDays', true)} /></Field>
        <Field label="Default print format">
          <select className="input" value={s.printFormat} onChange={set('printFormat')}>
            <option value="a4">A4 invoice</option><option value="thermal">80mm thermal receipt</option>
          </select>
        </Field>
        <Field label="Expiry warning (days)"><input className="input" inputMode="numeric" value={s.expiryWarningDays} onChange={set('expiryWarningDays', true)} /></Field>
        <Field label="Default reorder level"><input className="input" inputMode="numeric" value={s.lowStockDefault} onChange={set('lowStockDefault', true)} /></Field>
        <Field label="Device code" hint="Part of invoice numbers"><input className="input uppercase" maxLength={4} value={s.deviceCode}
          onChange={(e) => updateSettings({ deviceCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} /></Field>
        <Field label="Bank details (printed)" className="sm:col-span-3"><textarea className="input" rows={2} value={s.bankDetails} onChange={set('bankDetails')} placeholder="Bank, IBAN, SWIFT" /></Field>
        <Field label="USDT wallet address (printed)" className="sm:col-span-3"><input className="input font-mono" value={s.usdtWallet} onChange={set('usdtWallet')} placeholder="TRC20 / ERC20 address" /></Field>
        <Field label="Invoice footer" className="sm:col-span-3"><textarea className="input" rows={2} value={s.invoiceFooter} onChange={set('invoiceFooter')} /></Field>
      </div>
    </Section>
  );
}

function CloudSection() {
  const s = useSettings();
  const toast = useToast();
  const status = useSyncStatus();
  const [session, setSession] = useState(null);
  const [creds, setCreds] = useState({ email: '', password: '' });
  const client = getSupabase(s.sync.supabaseUrl, s.sync.supabaseAnonKey);
  const setSync = (k) => (e) => updateSettings((cur) => ({ ...cur, sync: { ...cur.sync, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value.trim() } }));

  useEffect(() => {
    if (!client) { setSession(null); return undefined; }
    client.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = client.auth.onAuthStateChange((_e, sess) => setSession(sess));
    return () => data.subscription.unsubscribe();
  }, [client]);

  const signIn = async (mode) => {
    if (!client) return;
    const fn = mode === 'up' ? client.auth.signUp : client.auth.signInWithPassword;
    const { error } = await fn.call(client.auth, creds);
    if (error) toast(error.message, 'error');
    else { toast(mode === 'up' ? 'Account created — check your email if confirmation is enabled' : 'Signed in'); syncEngine.syncSoon(300); }
  };

  const cloud = Object.entries(status.remotes).find(([id]) => id.startsWith('cloud:'))?.[1];

  return (
    <Section title="Cloud sync (Supabase)" description="Syncs invoices, customers, products and stock whenever this device is online. Run supabase/schema.sql in your project first.">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Project URL"><input className="input" placeholder="https://xyzcompany.supabase.co" value={s.sync.supabaseUrl} onChange={setSync('supabaseUrl')} /></Field>
        <Field label="Anon / publishable key"><input className="input font-mono text-xs" value={s.sync.supabaseAnonKey} onChange={setSync('supabaseAnonKey')} /></Field>
      </div>
      {client && (session ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <span>Signed in as <b>{session.user.email}</b>{cloud && <> · {cloud.ok ? `synced ${relative(cloud.lastSyncAt)}` : cloud.error}</>}</span>
          <button type="button" className="btn-secondary btn-sm" onClick={() => client.auth.signOut()}>Sign out</button>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
          <input className="input" type="email" placeholder="Email" value={creds.email} onChange={(e) => setCreds({ ...creds, email: e.target.value })} />
          <input className="input" type="password" placeholder="Password" value={creds.password} onChange={(e) => setCreds({ ...creds, password: e.target.value })} />
          <button type="button" className="btn-primary" onClick={() => signIn('in')}>Sign in</button>
          <button type="button" className="btn-secondary" onClick={() => signIn('up')}>Create account</button>
        </div>
      ))}
      <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={s.sync.autoSync} onChange={setSync('autoSync')} /> Auto-sync</label>
        <label className="flex items-center gap-2">every
          <input className="input w-20" inputMode="numeric" value={s.sync.intervalSec}
            onChange={(e) => updateSettings((cur) => ({ ...cur, sync: { ...cur.sync, intervalSec: Number(e.target.value) || 60 } }))} /> s</label>
        <button type="button" className="btn-secondary btn-sm" onClick={() => syncEngine.syncNow()}><Icon name="refresh" className="h-4 w-4" /> Sync now</button>
      </div>
    </Section>
  );
}

function DesktopHubSection() {
  const toast = useToast();
  const [info, setInfo] = useState(null);
  const [qr, setQr] = useState('');
  const [selected, setSelected] = useState('');

  const refresh = async () => setInfo(await desktop.getHubInfo());
  useEffect(() => { refresh(); }, []);

  const pairUrl = info && selected ? `${selected}/#/pair?token=${encodeURIComponent(info.token)}` : '';
  useEffect(() => {
    if (info && !selected && info.lanUrls.length) setSelected(info.lanUrls[0]);
  }, [info, selected]);
  useEffect(() => {
    if (!pairUrl) { setQr(''); return; }
    QRCode.toDataURL(pairUrl, { margin: 1, width: 360 }).then(setQr).catch(() => setQr(''));
  }, [pairUrl]);

  if (!info) return null;
  const toggle = async () => { setInfo(await desktop.setHubEnabled(!info.enabled)); await syncEngine.refreshDesktopHub(); };
  const rotate = async () => {
    if (!window.confirm('Generate a new token? All paired phones must scan the new QR code.')) return;
    setInfo(await desktop.regenerateHubToken());
    await syncEngine.refreshDesktopHub();
    toast('Hub token regenerated');
  };

  return (
    <Section title="Desktop hub (LAN / mobile companion)"
      description="Phones and tablets on the same Wi-Fi open PureLab from this computer and sync with it — no internet required.">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`badge ${info.running ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>{info.running ? 'Running' : 'Stopped'}</span>
        <button type="button" className="btn-secondary btn-sm" onClick={toggle}>{info.enabled ? 'Stop hub' : 'Start hub'}</button>
        <button type="button" className="btn-ghost btn-sm" onClick={rotate}>Regenerate token</button>
        <span className="text-xs text-slate-500">Hub records: {Object.entries(info.stats || {}).map(([k, v]) => `${k.replace('_', ' ')} ${v}`).join(' · ')}</span>
      </div>
      {info.errors?.length > 0 && <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{info.errors.join(' · ')}</div>}
      {info.running && info.lanUrls.length === 0 && <p className="mt-3 text-sm text-amber-700">No network adapter found. Connect this PC to Wi-Fi/LAN.</p>}
      {info.running && info.lanUrls.length > 0 && (
        <div className="mt-4 grid gap-5 sm:grid-cols-[200px_1fr]">
          {qr ? <img src={qr} alt="Pairing QR code" className="h-48 w-48 rounded-lg border border-slate-200" /> : <div className="h-48 w-48" />}
          <div className="space-y-3 text-sm">
            <Field label="Address">
              <select className="input" value={selected} onChange={(e) => setSelected(e.target.value)}>
                {info.lanUrls.map((u) => <option key={u} value={u}>{u}{u.startsWith('https') ? ' (camera enabled)' : ' (no camera)'}</option>)}
              </select>
            </Field>
            <ol className="list-decimal space-y-1 pl-5 text-slate-600">
              <li>Connect the phone to the same Wi-Fi as this computer.</li>
              <li>Scan this QR code with the phone camera and open the link.</li>
              <li>On HTTPS, accept the one-time certificate warning (self-signed, local only).</li>
              <li>Tap <b>Share → Add to Home Screen</b> for an app-like experience.</li>
            </ol>
            <div className="break-all rounded bg-slate-50 p-2 font-mono text-xs text-slate-500">{pairUrl}</div>
            <p className="text-xs text-slate-500">Allow PureLab through Windows Firewall (private networks) when prompted.</p>
          </div>
        </div>
      )}
    </Section>
  );
}

function MobileHubSection() {
  const s = useSettings();
  const setSync = (k) => (e) => updateSettings((cur) => ({ ...cur, sync: { ...cur.sync, [k]: e.target.value.trim() } }));
  return (
    <Section title="Desktop hub connection" description="Scan the pairing QR on the PureLab desktop app, or enter the details manually.">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Hub URL"><input className="input" placeholder="https://192.168.1.20:4546" value={s.sync.hubUrl} onChange={setSync('hubUrl')} /></Field>
        <Field label="Hub token"><input className="input font-mono" value={s.sync.hubToken} onChange={setSync('hubToken')} /></Field>
      </div>
      <button type="button" className="btn-secondary btn-sm mt-3" onClick={() => syncEngine.syncNow()}><Icon name="refresh" className="h-4 w-4" /> Sync now</button>
    </Section>
  );
}

function DataSection() {
  const toast = useToast();
  const settings = useSettings();
  const fileRef = useRef(null);

  const doExport = async () => {
    const json = await exportBackup();
    const name = `purelab-backup-${new Date().toISOString().slice(0, 10)}.json`;
    if (desktop) {
      const res = await desktop.saveBackup(json, name);
      if (res.saved) toast('Backup saved');
      return;
    }
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    a.click();
    URL.revokeObjectURL(url);
  };

  const doImport = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const n = await importBackup(await file.text());
      toast(`Imported ${n} records`);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const demo = async () => {
    if (!window.confirm('Add 10 demo products and 3 demo customers?')) return;
    const r = await loadDemoData(settings.defaultTaxRate);
    toast(`Added ${r.products} products and ${r.customers} customers`);
  };

  return (
    <Section title="Data" description="All data is stored on this device first (IndexedDB) and synced to the hub/cloud when available.">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary" onClick={doExport}><Icon name="download" className="h-4 w-4" /> Export backup</button>
        <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()}>Import backup</button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={doImport} />
        <button type="button" className="btn-ghost" onClick={demo}>Load demo data</button>
      </div>
      <p className="mt-3 text-xs text-slate-500">Device ID {settings.deviceId}</p>
    </Section>
  );
}

export default function Settings() {
  return (
    <div className="space-y-5">
      <PageHeader title="Settings" subtitle="Changes are saved automatically." />
      <CompanySection />
      <InvoicingSection />
      {isDesktop ? <DesktopHubSection /> : <MobileHubSection />}
      <CloudSection />
      <DataSection />
    </div>
  );
}
