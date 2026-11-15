/**
 * Print / PDF / share buttons for an invoice. Requires <PrintPortal> to be mounted
 * for the same invoice and format (it renders the printable document).
 */
import React, { useState } from 'react';
import { Icon, useToast } from './ui.jsx';
import { useT } from '../i18n/index.js';
import { printDocument } from '../lib/print.js';
import { downloadPdf, sharePdf, canShareFiles, whatsappUrl, mailtoUrl } from '../lib/share.js';

export default function ShareActions({ invoice, settings, format, layout = 'row' }) {
  const t = useT();
  const toast = useToast();
  const [busy, setBusy] = useState('');

  const run = (key, fn) => async () => {
    setBusy(key);
    try { await fn(); } catch (err) { toast(err.message || t('Something went wrong'), 'error'); } finally { setBusy(''); }
  };

  const actions = [
    { key: 'print', icon: 'printer', label: t('Print'), fn: () => printDocument(format) },
    {
      key: 'pdf', icon: 'download', label: t('PDF'),
      fn: async () => { const r = await downloadPdf(invoice, format); if (r?.saved) toast(t('PDF saved')); },
    },
    canShareFiles() && { key: 'share', icon: 'share', label: t('Share'), fn: () => sharePdf(invoice, format, settings.company) },
    { key: 'wa', icon: 'whatsapp', label: 'WhatsApp', fn: () => window.open(whatsappUrl(invoice, settings.company), '_blank', 'noopener') },
    { key: 'mail', icon: 'mail', label: t('Email'), fn: () => window.open(mailtoUrl(invoice, settings.company), '_blank', 'noopener') },
  ].filter(Boolean);

  if (layout === 'grid') {
    return (
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {actions.map((a) => (
          <button key={a.key} type="button" onClick={run(a.key, a.fn)} disabled={!!busy}
            className="flex flex-col items-center gap-1.5 rounded-2xl border border-line bg-surface px-2 py-3 text-xs font-semibold text-ink transition hover:bg-subtle active:scale-95">
            <span className={`rounded-xl p-2 ${a.key === 'wa' ? 'bg-emerald-500/15 text-emerald-600' : 'bg-brand-500/10 text-accent'}`}>
              <Icon name={busy === a.key ? 'refresh' : a.icon} className={`h-5 w-5 ${busy === a.key ? 'animate-spin' : ''}`} />
            </span>
            {a.label}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a) => (
        <button key={a.key} type="button" className="btn-secondary btn-sm" onClick={run(a.key, a.fn)} disabled={!!busy}>
          <Icon name={busy === a.key ? 'refresh' : a.icon} className={`h-4 w-4 ${busy === a.key ? 'animate-spin' : ''} ${a.key === 'wa' ? 'text-emerald-600' : ''}`} />
          {a.label}
        </button>
      ))}
    </div>
  );
}
