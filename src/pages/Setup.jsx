/** First-run setup wizard for the owner: business → money → appearance → start. */
import React, { useRef, useState } from 'react';
import { Icon, Field, Segmented, useToast } from '../components/ui.jsx';
import LogoPicker from '../components/LogoPicker.jsx';
import { useT, LANGUAGES } from '../i18n/index.js';
import { useSettings, updateSettings } from '../lib/settings.js';
import { CURRENCIES } from '../lib/image.js';
import { resetFormatCache } from '../lib/format.js';
import { loadDemoData } from '../lib/demo.js';
import { importBackup } from '../db/repo.js';

export default function Setup() {
  const t = useT();
  const toast = useToast();
  const s = useSettings();
  const [step, setStep] = useState(0);
  const [start, setStart] = useState('empty');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const setCo = (k) => (e) => updateSettings((cur) => ({ ...cur, company: { ...cur.company, [k]: e.target.value } }));
  const setA = (patch) => updateSettings((cur) => ({ ...cur, appearance: { ...cur.appearance, ...patch } }));

  const steps = [t('Business'), t('Money'), t('Look & language'), t('Get started')];

  const finish = async () => {
    setBusy(true);
    try {
      if (start === 'demo') {
        const r = await loadDemoData(s.defaultTaxRate);
        toast(t('Added {p} products and {c} customers', { p: r.products, c: r.customers }));
      }
      updateSettings({ onboarded: true });
    } finally {
      setBusy(false);
    }
  };

  const onImport = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const n = await importBackup(await file.text());
      toast(t('Imported {n} records', { n }));
      updateSettings({ onboarded: true });
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <div className="flex min-h-full items-start justify-center px-4 py-8 sm:items-center">
      <div className="w-full max-w-xl animate-fade-in">
        <div className="mb-6 flex items-center gap-3">
          <span className="rounded-xl bg-brand-500/15 p-2 text-accent"><Icon name="sparkles" /></span>
          <div>
            <h1 className="text-xl font-bold text-ink">{t('Let’s set up PureLab')}</h1>
            <p className="text-sm text-muted">{t('Takes about a minute. You can change everything later in Settings.')}</p>
          </div>
        </div>

        <ol className="mb-5 grid grid-cols-4 gap-2">
          {steps.map((label, i) => (
            <li key={label} className="space-y-1.5">
              <div className={`h-1.5 rounded-full transition ${i <= step ? 'bg-brand-600 dark:bg-brand-400' : 'bg-line'}`} />
              <div className={`truncate text-xs font-semibold ${i === step ? 'text-ink' : 'text-faint'}`}>{label}</div>
            </li>
          ))}
        </ol>

        <div className="card p-5 sm:p-6">
          {step === 0 && (
            <div className="space-y-4">
              <LogoPicker value={s.company.logo} onChange={(logo) => updateSettings((cur) => ({ ...cur, company: { ...cur.company, logo } }))} />
              <Field label={t('Business name')}><input className="input" value={s.company.name} onChange={setCo('name')} /></Field>
              <Field label={t('Tagline')}><input className="input" value={s.company.tagline} onChange={setCo('tagline')} /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('Phone')}><input className="input" type="tel" value={s.company.phone} onChange={setCo('phone')} /></Field>
                <Field label={t('Tax / VAT ID')}><input className="input" value={s.company.taxId} onChange={setCo('taxId')} /></Field>
              </div>
              <Field label={t('Address')}><textarea className="input" rows={2} value={s.company.address} onChange={setCo('address')} /></Field>
            </div>
          )}
          {step === 1 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('Currency')}>
                <select className="input" value={s.currency} onChange={(e) => { updateSettings({ currency: e.target.value }); resetFormatCache(); }}>
                  {[...new Set([s.currency, ...CURRENCIES])].map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label={t('Default VAT %')}>
                <input className="input" inputMode="decimal" value={s.defaultTaxRate}
                  onChange={(e) => updateSettings({ defaultTaxRate: Number(e.target.value.replace(/[^0-9.]/g, '')) || 0 })} />
              </Field>
              <Field label={t('Invoice prefix')} hint={t('Invoice numbers look like {example}', { example: `${s.invoicePrefix}-${s.deviceCode}-000001` })}>
                <input className="input uppercase" value={s.invoicePrefix}
                  onChange={(e) => updateSettings({ invoicePrefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} />
              </Field>
              <Field label={t('Payment terms (days)')}>
                <input className="input" inputMode="numeric" value={s.paymentTermsDays}
                  onChange={(e) => updateSettings({ paymentTermsDays: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
              </Field>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <span className="label">{t('Language')}</span>
                <Segmented value={s.appearance.language} onChange={(language) => setA({ language })}
                  options={LANGUAGES.map((l) => ({ value: l.id, label: l.label }))} />
              </div>
              <div>
                <span className="label">{t('Theme')}</span>
                <Segmented value={s.appearance.theme} onChange={(theme) => setA({ theme })} options={[
                  { value: 'auto', label: t('Auto'), icon: 'monitor' },
                  { value: 'light', label: t('Light'), icon: 'sun' },
                  { value: 'dark', label: t('Dark'), icon: 'moon' },
                ]} />
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="grid gap-3">
              {[
                ['empty', 'box', t('Start empty'), t('Add your own products and customers.')],
                ['demo', 'sparkles', t('Try with demo data'), t('10 sample products and 3 customers to explore.')],
              ].map(([id, icon, title, text]) => (
                <button key={id} type="button" onClick={() => setStart(id)}
                  className={`flex items-center gap-4 rounded-2xl border-2 p-4 text-start transition ${start === id ? 'border-brand-600 bg-brand-500/5' : 'border-line hover:border-faint'}`}>
                  <span className="rounded-xl bg-subtle p-2.5 text-accent"><Icon name={icon} /></span>
                  <span><span className="block font-semibold text-ink">{title}</span><span className="block text-sm text-muted">{text}</span></span>
                </button>
              ))}
              <button type="button" onClick={() => fileRef.current?.click()}
                className="flex items-center gap-4 rounded-2xl border-2 border-line p-4 text-start transition hover:border-faint">
                <span className="rounded-xl bg-subtle p-2.5 text-accent"><Icon name="upload" /></span>
                <span><span className="block font-semibold text-ink">{t('Import a backup')}</span><span className="block text-sm text-muted">{t('Restore a PureLab backup file (.json).')}</span></span>
              </button>
              <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={onImport} />
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          {step > 0
            ? <button type="button" className="btn-ghost" onClick={() => setStep(step - 1)}><Icon name="chevronLeft" className="h-4 w-4" />{t('Back')}</button>
            : <button type="button" className="btn-ghost" onClick={() => updateSettings({ onboarded: true })}>{t('Skip setup')}</button>}
          {step < steps.length - 1
            ? <button type="button" className="btn-primary" onClick={() => setStep(step + 1)}>{t('Continue')}<Icon name="arrowRight" className="h-4 w-4" /></button>
            : <button type="button" className="btn-primary" disabled={busy} onClick={finish}>{t('Open PureLab')}<Icon name="arrowRight" className="h-4 w-4" /></button>}
        </div>
      </div>
    </div>
  );
}
