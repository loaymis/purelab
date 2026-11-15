/** Settings in tabs: Business · Invoicing · Cloud & Team · Devices · Appearance · Data. */
import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import {
  Icon, Field, PageHeader, Tabs, Segmented, useToast, useConfirm,
} from '../components/ui.jsx';
import CloudPanel from '../components/CloudPanel.jsx';
import LogoPicker from '../components/LogoPicker.jsx';
import InstallButton from '../components/InstallButton.jsx';
import { useSettings, updateSettings } from '../lib/settings.js';
import { resetFormatCache } from '../lib/format.js';
import { CURRENCIES } from '../lib/image.js';
import { desktop, isDesktop } from '../lib/platform.js';
import { syncEngine } from '../sync/engine.js';
import { exportBackup, importBackup } from '../db/repo.js';
import { loadDemoData } from '../lib/demo.js';
import { useT, LANGUAGES } from '../i18n/index.js';

function Section({ title, description, children }) {
  return (
    <section className="card p-4 sm:p-6">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function BusinessTab() {
  const t = useT();
  const s = useSettings();
  const setCo = (k) => (e) => updateSettings((cur) => ({ ...cur, company: { ...cur.company, [k]: e.target.value } }));
  const set = (k) => (e) => updateSettings({ [k]: e.target.value });
  return (
    <div className="space-y-5">
      <Section title={t('Company & branding')} description={t('Printed on every invoice and receipt.')}>
        <div className="mb-5"><LogoPicker value={s.company.logo} onChange={(logo) => updateSettings((cur) => ({ ...cur, company: { ...cur.company, logo } }))} /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('Business name')}><input className="input" value={s.company.name} onChange={setCo('name')} /></Field>
          <Field label={t('Tagline')}><input className="input" value={s.company.tagline} onChange={setCo('tagline')} /></Field>
          <Field label={t('Address')} className="sm:col-span-2"><textarea className="input" rows={2} value={s.company.address} onChange={setCo('address')} /></Field>
          <Field label={t('Phone')}><input className="input" dir="ltr" value={s.company.phone} onChange={setCo('phone')} /></Field>
          <Field label={t('Email')}><input className="input" dir="ltr" value={s.company.email} onChange={setCo('email')} /></Field>
          <Field label={t('Website')}><input className="input" dir="ltr" value={s.company.website} onChange={setCo('website')} /></Field>
          <Field label={t('Tax / VAT ID')}><input className="input" value={s.company.taxId} onChange={setCo('taxId')} /></Field>
          <Field label={t('Pharmacy / manufacturing licence')}><input className="input" value={s.company.license} onChange={setCo('license')} /></Field>
        </div>
      </Section>
      <Section title={t('Payment details')} description={t('Printed on A4 invoices so customers know how to pay.')}>
        <div className="grid gap-4">
          <Field label={t('Bank details')}><textarea className="input" dir="ltr" rows={2} value={s.bankDetails} onChange={set('bankDetails')} placeholder="Bank · IBAN · SWIFT" /></Field>
          <Field label={t('USDT wallet address')}><input className="input font-mono" dir="ltr" value={s.usdtWallet} onChange={set('usdtWallet')} placeholder="TRC20 / ERC20" /></Field>
        </div>
      </Section>
    </div>
  );
}

function InvoicingTab() {
  const t = useT();
  const s = useSettings();
  const setNum = (k) => (e) => updateSettings({ [k]: Number(e.target.value.replace(/[^0-9.]/g, '')) || 0 });
  return (
    <Section title={t('Invoicing')} description={t('Invoice numbers on this device: {example} (unique per device, safe offline).', { example: `${s.invoicePrefix}-${s.deviceCode}-000001` })}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('Currency')}>
          <select className="input" value={s.currency} onChange={(e) => { updateSettings({ currency: e.target.value }); resetFormatCache(); }}>
            {[...new Set([s.currency, ...CURRENCIES])].map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label={t('Invoice prefix')}><input className="input uppercase" value={s.invoicePrefix} onChange={(e) => updateSettings({ invoicePrefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} /></Field>
        <Field label={t('Device code')} hint={t('Part of invoice numbers')}>
          <input className="input uppercase" maxLength={4} value={s.deviceCode} onChange={(e) => updateSettings({ deviceCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} />
        </Field>
        <Field label={t('Default VAT %')}><input className="input" inputMode="decimal" value={s.defaultTaxRate} onChange={setNum('defaultTaxRate')} /></Field>
        <Field label={t('Payment terms (days)')}><input className="input" inputMode="numeric" value={s.paymentTermsDays} onChange={setNum('paymentTermsDays')} /></Field>
        <Field label={t('Expiry warning (days)')}><input className="input" inputMode="numeric" value={s.expiryWarningDays} onChange={setNum('expiryWarningDays')} /></Field>
        <Field label={t('Default reorder level')}><input className="input" inputMode="numeric" value={s.lowStockDefault} onChange={setNum('lowStockDefault')} /></Field>
        <div className="sm:col-span-2">
          <span className="label">{t('Default print format')}</span>
          <Segmented value={s.printFormat} onChange={(printFormat) => updateSettings({ printFormat })}
            options={[{ value: 'a4', label: t('A4 invoice') }, { value: 'thermal', label: t('80mm receipt') }]} />
        </div>
        <div className="sm:col-span-3">
          <span className="label">{t('Invoice language')}</span>
          <Segmented value={s.invoiceLanguage || 'auto'} onChange={(invoiceLanguage) => updateSettings({ invoiceLanguage })} options={[
            { value: 'auto', label: t('Same as app') }, { value: 'en', label: 'English' },
            { value: 'ar', label: 'العربية' }, { value: 'bilingual', label: t('Bilingual') },
          ]} />
        </div>
        <Field label={t('Invoice footer')} className="sm:col-span-3"><textarea className="input" rows={2} value={s.invoiceFooter} onChange={(e) => updateSettings({ invoiceFooter: e.target.value })} /></Field>
      </div>
    </Section>
  );
}

function DesktopHub() {
  const t = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const [info, setInfo] = useState(null);
  const [qr, setQr] = useState('');
  const [selected, setSelected] = useState('');

  useEffect(() => { desktop.getHubInfo().then(setInfo); }, []);
  const pairUrl = info && selected ? `${selected}/#/pair?token=${encodeURIComponent(info.token)}` : '';
  useEffect(() => { if (info && !selected && info.lanUrls.length) setSelected(info.lanUrls[0]); }, [info, selected]);
  useEffect(() => {
    if (!pairUrl) { setQr(''); return; }
    QRCode.toDataURL(pairUrl, { margin: 1, width: 360 }).then(setQr).catch(() => setQr(''));
  }, [pairUrl]);

  if (!info) return null;
  const toggle = async () => { setInfo(await desktop.setHubEnabled(!info.enabled)); await syncEngine.refreshDesktopHub(); };
  const rotate = async () => {
    if (!(await confirm({ message: t('Generate a new token? All paired phones must scan the new QR code.'), confirmLabel: t('Regenerate') }))) return;
    setInfo(await desktop.regenerateHubToken());
    await syncEngine.refreshDesktopHub();
    toast(t('Hub token regenerated'));
  };

  return (
    <Section title={t('Desktop hub (LAN)')} description={t('Phones and tablets on the same Wi-Fi can open PureLab from this computer and sync with it — no internet needed.')}>
      <div className="flex flex-wrap items-center gap-3">
        <span className={`badge ${info.running ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-subtle text-muted'}`}>{info.running ? t('Running') : t('Stopped')}</span>
        <button type="button" className="btn-secondary btn-sm" onClick={toggle}>{info.enabled ? t('Stop hub') : t('Start hub')}</button>
        <button type="button" className="btn-ghost btn-sm" onClick={rotate}>{t('Regenerate token')}</button>
      </div>
      {info.errors?.length > 0 && <div className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">{info.errors.join(' · ')}</div>}
      {info.running && info.lanUrls.length === 0 && <p className="mt-3 text-sm text-amber-600">{t('No network adapter found. Connect this PC to Wi-Fi or LAN.')}</p>}
      {info.running && info.lanUrls.length > 0 && (
        <div className="mt-5 grid gap-5 sm:grid-cols-[200px_1fr]">
          {qr ? <img src={qr} alt={t('Pairing QR code')} className="h-48 w-48 rounded-2xl border border-line bg-white p-2" /> : <div className="h-48 w-48" />}
          <div className="space-y-3 text-sm">
            <Field label={t('Address')}>
              <select className="input" dir="ltr" value={selected} onChange={(e) => setSelected(e.target.value)}>
                {info.lanUrls.map((u) => <option key={u} value={u}>{u}{u.startsWith('https') ? ` (${t('camera enabled')})` : ` (${t('no camera')})`}</option>)}
              </select>
            </Field>
            <ol className="list-decimal space-y-1 ps-5 text-muted">
              <li>{t('Connect the phone to the same Wi-Fi as this computer.')}</li>
              <li>{t('Scan this QR code with the phone camera and open the link.')}</li>
              <li>{t('On HTTPS, accept the one-time certificate warning (local only).')}</li>
            </ol>
            <div className="break-all rounded-xl bg-subtle p-2 font-mono text-xs text-muted" dir="ltr">{pairUrl}</div>
          </div>
        </div>
      )}
    </Section>
  );
}

function MobileHub() {
  const t = useT();
  const s = useSettings();
  const setSync = (k) => (e) => updateSettings((cur) => ({ ...cur, sync: { ...cur.sync, [k]: e.target.value.trim() } }));
  return (
    <Section title={t('Desktop hub connection')} description={t('Optional: sync over Wi-Fi with the PureLab desktop app. Scan its pairing QR code, or enter the details.')}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('Hub URL')}><input className="input" dir="ltr" placeholder="https://192.168.1.20:4546" value={s.sync.hubUrl} onChange={setSync('hubUrl')} /></Field>
        <Field label={t('Hub token')}><input className="input font-mono" dir="ltr" value={s.sync.hubToken} onChange={setSync('hubToken')} /></Field>
      </div>
    </Section>
  );
}

function AppearanceTab() {
  const t = useT();
  const s = useSettings();
  const setA = (patch) => updateSettings((cur) => ({ ...cur, appearance: { ...cur.appearance, ...patch } }));
  return (
    <Section title={t('Appearance')} description={t('Applies to this device.')}>
      <div className="space-y-6">
        <div>
          <span className="label">{t('Theme')}</span>
          <Segmented value={s.appearance.theme} onChange={(theme) => setA({ theme })} options={[
            { value: 'auto', label: t('Follow device'), icon: 'monitor' },
            { value: 'light', label: t('Light'), icon: 'sun' },
            { value: 'dark', label: t('Dark'), icon: 'moon' },
          ]} />
        </div>
        <div>
          <span className="label">{t('Language')}</span>
          <Segmented value={s.appearance.language} onChange={(language) => setA({ language })} options={LANGUAGES.map((l) => ({ value: l.id, label: l.label }))} />
        </div>
        {s.appearance.language === 'ar' && (
          <div>
            <span className="label">{t('Numbers')}</span>
            <Segmented value={s.appearance.digits} onChange={(digits) => setA({ digits })} options={[
              { value: 'latn', label: '0123' }, { value: 'arab', label: '٠١٢٣' },
            ]} />
          </div>
        )}
        <InstallButton />
      </div>
    </Section>
  );
}

function DataTab() {
  const t = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const settings = useSettings();
  const fileRef = useRef(null);

  const doExport = async () => {
    const json = await exportBackup();
    const name = `purelab-backup-${new Date().toISOString().slice(0, 10)}.json`;
    if (desktop) {
      const res = await desktop.saveBackup(json, name);
      if (res.saved) toast(t('Backup saved'));
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
      toast(t('Imported {n} records', { n }));
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  const demo = async () => {
    if (!(await confirm({ message: t('Add 10 demo products and 3 demo customers?'), confirmLabel: t('Add demo data') }))) return;
    const r = await loadDemoData(settings.defaultTaxRate);
    toast(t('Added {p} products and {c} customers', { p: r.products, c: r.customers }));
  };

  return (
    <Section title={t('Data')} description={t('Everything is saved on this device first, then synced to the cloud or hub when available.')}>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['download', t('Export backup'), t('Download all data as a .json file.'), doExport],
          ['upload', t('Import backup'), t('Merge a backup file. Newer data is kept.'), () => fileRef.current?.click()],
          ['sparkles', t('Load demo data'), t('Sample products and customers.'), demo],
        ].map(([icon, title, text, fn]) => (
          <button key={title} type="button" onClick={fn} className="flex items-start gap-3 rounded-2xl border border-line p-4 text-start transition hover:bg-subtle">
            <span className="rounded-xl bg-brand-500/10 p-2 text-accent"><Icon name={icon} /></span>
            <span><span className="block font-semibold text-ink">{title}</span><span className="block text-xs text-muted">{text}</span></span>
          </button>
        ))}
      </div>
      <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={doImport} />
      <p className="mt-4 text-xs text-faint" dir="ltr">Device {settings.deviceCode} · {settings.deviceId}</p>
    </Section>
  );
}

export default function Settings() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'business';
  const tabs = [
    { id: 'business', label: t('Business'), icon: 'store' },
    { id: 'invoicing', label: t('Invoicing'), icon: 'invoice' },
    { id: 'cloud', label: t('Cloud & Team'), icon: 'cloud' },
    { id: 'devices', label: t('Devices'), icon: 'wifi' },
    { id: 'appearance', label: t('Appearance'), icon: 'sun' },
    { id: 'data', label: t('Data'), icon: 'download' },
  ];
  return (
    <div>
      <PageHeader title={t('Settings')} subtitle={t('Changes are saved automatically.')} />
      <Tabs className="mb-5" tabs={tabs} value={tab} onChange={(id) => setParams({ tab: id }, { replace: true })} />
      <div key={tab} className="animate-fade-in">
        {tab === 'business' && <BusinessTab />}
        {tab === 'invoicing' && <InvoicingTab />}
        {tab === 'cloud' && <CloudPanel />}
        {tab === 'devices' && (isDesktop ? <DesktopHub /> : <MobileHub />)}
        {tab === 'appearance' && <AppearanceTab />}
        {tab === 'data' && <DataTab />}
      </div>
    </div>
  );
}
