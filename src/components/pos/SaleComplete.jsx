/** Success screen after a sale: change due, print / PDF / share, new sale. */
import React from 'react';
import { Link } from 'react-router-dom';
import { Icon, Segmented } from '../ui.jsx';
import ShareActions from '../ShareActions.jsx';
import { PrintPortal } from '../InvoiceDocument.jsx';
import { useT } from '../../i18n/index.js';
import { money } from '../../lib/format.js';
import { useSettings, updateSettings } from '../../lib/settings.js';

export default function SaleComplete({ invoice, onNewSale }) {
  const t = useT();
  const settings = useSettings();
  const format = settings.printFormat;
  const tt = invoice.totals || {};
  return (
    <div className="mx-auto max-w-lg py-6 text-center animate-fade-in">
      <div className="relative mx-auto mb-5 h-20 w-20">
        <div className="absolute inset-0 animate-ping rounded-full bg-emerald-500/20" />
        <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-lg">
          <Icon name="check" className="h-10 w-10" strokeWidth={2.5} />
        </div>
      </div>
      <h1 className="text-2xl font-bold text-ink">{t('Sale complete')}</h1>
      <p className="mt-1 text-muted">{invoice.number}{invoice.customer ? ` · ${invoice.customer.name}` : ''}</p>

      <div className="card mt-6 grid grid-cols-2 divide-x divide-line rtl:divide-x-reverse">
        <div className="p-4"><div className="text-xs font-semibold text-muted">{t('Total')}</div><div className="text-2xl font-bold tabular-nums text-ink">{money(tt.grandTotal, invoice.currency)}</div></div>
        {tt.changeDue > 0 ? (
          <div className="p-4"><div className="text-xs font-semibold text-emerald-600">{t('Change due')}</div><div className="text-2xl font-bold tabular-nums text-emerald-600">{money(tt.changeDue, invoice.currency)}</div></div>
        ) : tt.balance > 0 ? (
          <div className="p-4"><div className="text-xs font-semibold text-amber-600">{t('Balance due')}</div><div className="text-2xl font-bold tabular-nums text-amber-600">{money(tt.balance, invoice.currency)}</div></div>
        ) : (
          <div className="p-4"><div className="text-xs font-semibold text-muted">{t('Paid')}</div><div className="text-2xl font-bold tabular-nums text-ink">{money(tt.paid, invoice.currency)}</div></div>
        )}
      </div>

      <div className="mt-6 flex justify-center">
        <Segmented size="sm" value={format} onChange={(printFormat) => updateSettings({ printFormat })}
          options={[{ value: 'thermal', label: t('Receipt') }, { value: 'a4', label: 'A4' }]} />
      </div>
      <div className="mt-3"><ShareActions invoice={invoice} settings={settings} format={format} layout="grid" /></div>

      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        <button type="button" className="btn-primary" onClick={onNewSale}><Icon name="plus" className="h-4 w-4" />{t('New sale')}</button>
        <Link to={`/invoices/${invoice.id}`} className="btn-secondary">{t('View invoice')}</Link>
      </div>
      <PrintPortal invoice={invoice} settings={settings} format={format} />
    </div>
  );
}
