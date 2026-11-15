/**
 * Printable invoice in two layouts:
 *   - "a4":      full branded tax invoice (210 × 297 mm)
 *   - "thermal": 80 mm POS receipt
 * Language: Settings → Invoicing → Invoice language (app language, English, Arabic,
 * or bilingual English + Arabic labels). Arabic renders right-to-left.
 * Used for on-screen preview, printing, PDF export and sharing. Always light (paper).
 */
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { money, date, dateTime } from '../lib/format.js';
import { paymentStatus } from '../lib/calc.js';
import { PAYMENT_METHODS } from '../lib/settings.js';
import { translate, getLanguage } from '../i18n/index.js';

/** Label helper for the chosen invoice language. */
function useLabels(settings) {
  const mode = settings.invoiceLanguage === 'auto' || !settings.invoiceLanguage ? getLanguage() : settings.invoiceLanguage;
  const L = (text, vars) => {
    if (mode === 'bilingual') {
      const en = translate('en', text, vars);
      const ar = translate('ar', text, vars);
      return en === ar ? en : <>{en}<span className="block text-[0.85em] font-normal opacity-80" dir="rtl">{ar}</span></>;
    }
    return translate(mode, text, vars);
  };
  const Ls = (text, vars) => (mode === 'bilingual' ? `${translate('en', text, vars)} / ${translate('ar', text, vars)}` : translate(mode, text, vars));
  return { L, Ls, dir: mode === 'ar' ? 'rtl' : 'ltr', lang: mode === 'bilingual' ? 'en' : mode };
}

const methodLabel = (id) => PAYMENT_METHODS.find((m) => m.id === id)?.label || id;
const STATUS_TEXT = { paid: 'Paid', partial: 'Partial', unpaid: 'Unpaid', overdue: 'Overdue', draft: 'Draft', void: 'Void' };

function useQr(invoice, company) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let alive = true;
    const payload = [
      company.name, `INV:${invoice.number}`, `DATE:${invoice.date}`,
      `TOTAL:${invoice.totals?.grandTotal ?? 0} ${invoice.currency || ''}`,
      company.taxId ? `TAXID:${company.taxId}` : '',
    ].filter(Boolean).join('|');
    QRCode.toDataURL(payload, { margin: 0, width: 220, errorCorrectionLevel: 'M' })
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(''));
    return () => { alive = false; };
  }, [invoice.number, invoice.date, invoice.totals?.grandTotal, invoice.currency, company.name, company.taxId]);
  return src;
}

function Totals({ t, currency, compact, L }) {
  const row = (label, value, strong) => (
    <div className={`flex items-start justify-between gap-4 ${strong ? 'font-bold' : ''} ${compact ? 'py-0.5' : 'py-1'}`}>
      <span>{label}</span><span className="whitespace-nowrap tabular-nums">{money(value, currency)}</span>
    </div>
  );
  return (
    <div>
      {row(L('Subtotal'), t.subtotal)}
      {t.lineDiscounts > 0 && row(L('Line discounts'), -t.lineDiscounts)}
      {t.invoiceDiscount > 0 && row(L('Discount'), -t.invoiceDiscount)}
      {t.taxBreakdown?.filter((b) => b.rate > 0).map((b) => (
        <div key={b.rate} className={`flex items-start justify-between gap-4 ${compact ? 'py-0.5' : 'py-1'}`}>
          <span>{L('VAT {rate}%', { rate: b.rate })}</span><span className="tabular-nums">{money(b.tax, currency)}</span>
        </div>
      ))}
      <div className={`mt-1 border-t border-current pt-1 ${compact ? 'text-sm' : 'text-lg'}`}>{row(L('Total'), t.grandTotal, true)}</div>
      {t.paid > 0 && row(L('Paid'), t.paid)}
      {t.changeDue > 0 && row(L('Change'), t.changeDue)}
      {t.balance > 0 && row(L('Balance due'), t.balance, true)}
    </div>
  );
}

function A4Invoice({ invoice, settings, qr }) {
  const { company } = settings;
  const { L, dir, lang } = useLabels(settings);
  const t = invoice.totals || {};
  const status = paymentStatus(invoice);
  const c = invoice.customer;
  return (
    <div dir={dir} lang={lang} className="relative mx-auto box-border min-h-[297mm] w-[210mm] bg-white p-[14mm] text-start text-[12px] leading-snug text-slate-800">
      {status === 'void' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="-rotate-12 text-[110px] font-black tracking-widest text-rose-500/20">VOID</span>
        </div>
      )}
      <header className="flex items-start justify-between gap-6 border-b-4 border-brand-700 pb-5">
        <div className="flex items-center gap-3">
          <img src={company.logo || './icon-192.png'} alt="" className="h-16 w-16 rounded-xl object-contain" />
          <div>
            <div className="text-[26px] font-extrabold tracking-tight text-brand-800">{company.name}</div>
            <div className="text-[11px] uppercase tracking-[0.12em] text-brand-600">{company.tagline}</div>
          </div>
        </div>
        <div className="text-end text-[11px] text-slate-600">
          {company.address && <div className="whitespace-pre-line">{company.address}</div>}
          {company.phone && <div dir="ltr">{company.phone}</div>}
          {company.email && <div>{company.email}</div>}
          {company.website && <div>{company.website}</div>}
          {company.taxId && <div>{L('Tax ID')}: {company.taxId}</div>}
          {company.license && <div>{L('Licence')}: {company.license}</div>}
        </div>
      </header>

      <section className="mt-6 flex justify-between gap-6">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{L('Bill to')}</div>
          {c ? (
            <div className="mt-1">
              <div className="text-[14px] font-semibold text-slate-900">{c.name}</div>
              {c.address && <div className="whitespace-pre-line text-slate-600">{c.address}</div>}
              {c.phone && <div className="text-slate-600" dir="ltr">{c.phone}</div>}
              {c.email && <div className="text-slate-600">{c.email}</div>}
              {c.taxId && <div className="text-slate-600">{L('Tax ID')}: {c.taxId}</div>}
            </div>
          ) : <div className="mt-1 font-semibold">{L('Walk-in customer')}</div>}
        </div>
        <div className="text-end">
          <div className="text-[22px] font-bold uppercase tracking-wide text-slate-900">
            {invoice.status === 'draft' ? L('Draft Invoice') : L('Tax Invoice')}
          </div>
          <table className="ms-auto mt-2 text-[12px]">
            <tbody>
              <tr><td className="pe-4 text-slate-500">{L('Invoice #')}</td><td className="font-semibold" dir="ltr">{invoice.number || '—'}</td></tr>
              <tr><td className="pe-4 text-slate-500">{L('Date')}</td><td>{date(invoice.date)}</td></tr>
              {invoice.dueDate && <tr><td className="pe-4 text-slate-500">{L('Due')}</td><td>{date(invoice.dueDate)}</td></tr>}
              <tr><td className="pe-4 text-slate-500">{L('Status')}</td><td className="font-semibold uppercase">{L(STATUS_TEXT[status] || status)}</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <table className="mt-6 w-full border-collapse text-[11.5px]">
        <thead>
          <tr className="bg-brand-700 text-start align-top text-white">
            <th className="px-2 py-2 text-start font-semibold">#</th>
            <th className="px-2 py-2 text-start font-semibold">{L('Product')}</th>
            <th className="px-2 py-2 text-start font-semibold">{L('Batch / Exp.')}</th>
            <th className="px-2 py-2 text-end font-semibold">{L('Qty')}</th>
            <th className="px-2 py-2 text-end font-semibold">{L('Unit price')}</th>
            <th className="px-2 py-2 text-end font-semibold">{L('Disc.')}</th>
            <th className="px-2 py-2 text-end font-semibold">{L('VAT')}</th>
            <th className="px-2 py-2 text-end font-semibold">{L('Amount')}</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((it, i) => (
            <tr key={it.key || i} className="border-b border-slate-200 odd:bg-slate-50">
              <td className="px-2 py-1.5 align-top text-slate-500">{i + 1}</td>
              <td className="px-2 py-1.5 align-top">
                <div className="font-medium text-slate-900">{it.name}</div>
                <div className="text-[10px] text-slate-500" dir="ltr">{it.sku}</div>
              </td>
              <td className="px-2 py-1.5 align-top text-[10.5px]">
                {it.batchNumber || '—'}{it.expiryDate ? <div className="text-slate-500">{it.expiryDate}</div> : null}
              </td>
              <td className="px-2 py-1.5 text-end align-top">{it.qty}</td>
              <td className="px-2 py-1.5 text-end align-top">{money(it.price, invoice.currency)}</td>
              <td className="px-2 py-1.5 text-end align-top">{Number(it.discountPct) ? `${it.discountPct}%` : '—'}</td>
              <td className="px-2 py-1.5 text-end align-top">{Number(it.taxRate) ? `${it.taxRate}%` : '—'}</td>
              <td className="px-2 py-1.5 text-end align-top font-medium">{money(t.lineTotals?.[i] ?? 0, invoice.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="mt-6 flex items-start justify-between gap-8">
        <div className="max-w-[95mm] space-y-3 text-[11px] text-slate-600">
          {invoice.payments?.length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{L('Payments')}</div>
              {invoice.payments.map((p) => (
                <div key={p.id}>
                  {date(p.date)} · {L(methodLabel(p.method))} · {money(p.amount, invoice.currency)}
                  {p.reference ? <span className="break-all"> · {L('Ref')}: {p.reference}</span> : null}
                </div>
              ))}
            </div>
          )}
          {settings.bankDetails && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{L('Bank transfer')}</div>
              <div className="whitespace-pre-line" dir="ltr">{settings.bankDetails}</div>
            </div>
          )}
          {settings.usdtWallet && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{L('USDT wallet')}</div>
              <div className="break-all font-mono" dir="ltr">{settings.usdtWallet}</div>
            </div>
          )}
          {invoice.notes && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{L('Notes')}</div>
              <div className="whitespace-pre-line">{invoice.notes}</div>
            </div>
          )}
        </div>
        <div className="w-[80mm] text-[12px]"><Totals t={t} currency={invoice.currency} L={L} /></div>
      </section>

      <footer className="absolute inset-x-[14mm] bottom-[12mm] flex items-end justify-between gap-6 border-t border-slate-200 pt-3 text-[10px] text-slate-500">
        <div className="max-w-[140mm] whitespace-pre-line">{settings.invoiceFooter}</div>
        {qr && <img src={qr} alt="" className="h-[22mm] w-[22mm]" />}
      </footer>
    </div>
  );
}

function ThermalReceipt({ invoice, settings, qr }) {
  const { company } = settings;
  const { L, Ls, dir, lang } = useLabels(settings);
  const t = invoice.totals || {};
  return (
    <div dir={dir} lang={lang} className="mx-auto box-border w-[80mm] bg-white p-[4mm] text-start font-mono text-[11px] leading-tight text-black">
      <div className="text-center">
        {company.logo && <img src={company.logo} alt="" className="mx-auto mb-1 h-12 w-12 object-contain grayscale" />}
        <div className="text-[18px] font-extrabold tracking-wide">{company.name}</div>
        <div className="text-[9px] uppercase">{company.tagline}</div>
        {company.address && <div className="mt-1 whitespace-pre-line">{company.address}</div>}
        {company.phone && <div dir="ltr">{company.phone}</div>}
        {company.taxId && <div>{Ls('Tax ID')} {company.taxId}</div>}
      </div>
      <div className="my-2 border-t border-dashed border-black" />
      <div className="flex justify-between gap-2"><span>{invoice.status === 'draft' ? L('Draft') : L('Invoice')}</span><span dir="ltr">{invoice.number}</span></div>
      <div>{dateTime(invoice.issuedAt || invoice.created_at || Date.now())}</div>
      {invoice.customer && <div>{Ls('Customer')}: {invoice.customer.name}</div>}
      {invoice.status === 'void' && <div className="my-1 text-center text-[14px] font-bold">*** VOID ***</div>}
      <div className="my-2 border-t border-dashed border-black" />
      {invoice.items.map((it, i) => (
        <div key={it.key || i} className="mb-1">
          <div className="break-words">{it.name}</div>
          <div className="flex justify-between gap-2">
            <span>{it.qty} × {money(it.price, invoice.currency)}{Number(it.discountPct) ? ` −${it.discountPct}%` : ''}</span>
            <span>{money(t.lineTotals?.[i] ?? 0, invoice.currency)}</span>
          </div>
          {it.batchNumber && <div className="text-[9px]">{Ls('Batch')} {it.batchNumber}{it.expiryDate ? ` · ${Ls('Exp')} ${it.expiryDate}` : ''}</div>}
        </div>
      ))}
      <div className="my-2 border-t border-dashed border-black" />
      <Totals t={t} currency={invoice.currency} compact L={L} />
      {invoice.payments?.length > 0 && (
        <>
          <div className="my-2 border-t border-dashed border-black" />
          {invoice.payments.map((p) => (
            <div key={p.id} className="flex justify-between gap-2">
              <span>{Ls(methodLabel(p.method))}</span><span>{money(p.amount, invoice.currency)}</span>
            </div>
          ))}
        </>
      )}
      <div className="my-2 border-t border-dashed border-black" />
      <div className="whitespace-pre-line text-center text-[9px]">{settings.invoiceFooter}</div>
      {qr && <img src={qr} alt="" className="mx-auto mt-2 h-[26mm] w-[26mm]" />}
      <div className="mt-1 text-center text-[9px]">{Ls('Items')}: {t.itemCount}</div>
    </div>
  );
}

export default function InvoiceDocument({ invoice, settings, format = 'a4' }) {
  const qr = useQr(invoice, settings.company);
  return format === 'thermal'
    ? <ThermalReceipt invoice={invoice} settings={settings} qr={qr} />
    : <A4Invoice invoice={invoice} settings={settings} qr={qr} />;
}

/** Renders the document into #print-root (outside the app) for printing / PDF / sharing. */
export function PrintPortal({ invoice, settings, format }) {
  const [el] = useState(() => {
    let node = document.getElementById('print-root');
    if (!node) {
      node = document.createElement('div');
      node.id = 'print-root';
      document.body.appendChild(node);
    }
    return node;
  });
  return createPortal(<InvoiceDocument invoice={invoice} settings={settings} format={format} />, el);
}
