/** Invoice preview with print / PDF / share, payments, void, duplicate. */
import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import InvoiceDocument, { PrintPortal } from '../components/InvoiceDocument.jsx';
import ShareActions from '../components/ShareActions.jsx';
import {
  Icon, Sheet, Field, StatusBadge, Segmented, Skeleton, useToast, useConfirm, usePrompt,
} from '../components/ui.jsx';
import { useInvoice } from '../db/hooks.js';
import { addPayment, voidInvoice, deleteInvoice, saveInvoice } from '../db/repo.js';
import { paymentStatus } from '../lib/calc.js';
import { quickCashAmounts } from '../lib/cash.js';
import { money, todayISO } from '../lib/format.js';
import { printDocument } from '../lib/print.js';
import { useSettings, updateSettings } from '../lib/settings.js';
import { useT } from '../i18n/index.js';

function PaymentSheet({ open, invoice, onClose }) {
  const t = useT();
  const toast = useToast();
  const [form, setForm] = useState({ method: 'cash', amount: '', reference: '', date: todayISO() });
  useEffect(() => {
    if (open) setForm({ method: 'cash', amount: String(invoice.totals?.balance || ''), reference: '', date: todayISO() });
  }, [open, invoice]);
  const submit = async (e) => {
    e.preventDefault();
    if (!(Number(form.amount) > 0)) return;
    await addPayment(invoice.id, form);
    toast(t('Payment of {amount} recorded', { amount: money(form.amount) }));
    onClose();
  };
  return (
    <Sheet open={open} size="sm" title={t('Record payment')} onClose={onClose}
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>{t('Cancel')}</button>
        <button type="submit" form="pay-form" className="btn-primary">{t('Save payment')}</button></>}>
      <form id="pay-form" onSubmit={submit} className="space-y-4">
        <div className="flex items-center justify-between rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          <span>{t('Balance due')}</span><b className="text-lg tabular-nums">{money(invoice.totals?.balance)}</b>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-xl bg-subtle px-3 py-1.5 text-sm font-semibold text-ink">
          <Icon name="cash" className="h-4 w-4 text-accent" />{t('Cash')}
        </div>
        <Field label={t('Amount')}>
          <input className="input text-lg font-bold tabular-nums" inputMode="decimal" required value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^0-9.]/g, '') })} />
        </Field>
        <div className="flex flex-wrap gap-2">
          {quickCashAmounts(invoice.totals?.balance || 0, 3).map((v) => (
            <button key={v} type="button" className="chip" onClick={() => setForm({ ...form, amount: String(v) })}>{money(v)}</button>
          ))}
        </div>
        <Field label={t('Date')}><input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
      </form>
    </Sheet>
  );
}

export default function InvoiceView() {
  const t = useT();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const settings = useSettings();
  const invoice = useInvoice(id);
  const [format, setFormat] = useState(settings.printFormat);
  const [payOpen, setPayOpen] = useState(false);
  const autoPrinted = useRef(false);

  useEffect(() => {
    if (invoice && location.state?.autoPrint && !autoPrinted.current) {
      autoPrinted.current = true;
      navigate(location.pathname, { replace: true, state: {} });
      setTimeout(() => printDocument(format), 300);
    }
  }); // eslint-disable-line react-hooks/exhaustive-deps

  if (invoice === undefined) {
    return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-[60vh] w-full rounded-2xl" /></div>;
  }
  if (!invoice || invoice.deleted) {
    return <div className="p-8 text-center text-muted">{t('Invoice not found.')} <Link className="text-accent underline" to="/invoices">{t('Back to invoices')}</Link></div>;
  }

  const status = paymentStatus(invoice);

  const onVoid = async () => {
    const reason = await prompt({ title: t('Void invoice'), message: t('Stock will be returned. Why are you voiding this invoice?'), confirmLabel: t('Void invoice'), placeholder: t('Reason (optional)') });
    if (reason === null) return;
    await voidInvoice(invoice.id, reason);
    toast(t('Invoice {n} voided', { n: invoice.number }), 'warn');
  };
  const onDelete = async () => {
    const isVoid = invoice.status === 'void';
    const message = isVoid ? t('Delete voided invoice {n}? This can’t be undone.', { n: invoice.number }) : t('Delete this draft?');
    if (!(await confirm({ title: isVoid ? t('Delete invoice') : undefined, message, danger: true, confirmLabel: t('Delete') }))) return;
    await deleteInvoice(invoice.id);
    toast(isVoid ? t('Invoice {n} deleted', { n: invoice.number }) : t('Draft deleted'));
    navigate('/invoices', { replace: true });
  };
  const onDuplicate = async () => {
    const { id: _id, number, totals, payments, issuedAt, created_at, updated_at, voidReason, voidedAt, ...rest } = invoice;
    const copy = await saveInvoice({ ...rest, id: null, number: '', payments: [], date: todayISO(), dueDate: '' }, 'draft');
    navigate(`/invoices/${copy.id}/edit`);
  };
  const onIssueDraft = async () => {
    await saveInvoice(invoice, 'issued');
    toast(t('Invoice {n} issued', { n: invoice.number }));
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" className="btn-icon -ms-2 rounded-full text-muted" onClick={() => navigate('/invoices')} aria-label={t('Back')}>
            <Icon name="chevronLeft" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-xl font-bold tracking-tight text-ink sm:text-2xl" dir="ltr">{invoice.number}</h1>
              <StatusBadge status={status} />
            </div>
            <p className="text-sm text-muted">
              {invoice.customer?.name || t('Walk-in customer')} · {money(invoice.totals?.grandTotal)}
              {invoice.totals?.balance > 0 && invoice.status === 'issued' && <> · <b className="text-amber-600">{t('{amount} due', { amount: money(invoice.totals.balance) })}</b></>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {invoice.status === 'issued' && invoice.totals?.balance > 0 && (
            <button type="button" className="btn-primary" onClick={() => setPayOpen(true)}><Icon name="wallet" className="h-4 w-4" />{t('Record payment')}</button>
          )}
          {invoice.status === 'draft' && (
            <button type="button" className="btn-primary" onClick={onIssueDraft}><Icon name="check" className="h-4 w-4" />{t('Issue')}</button>
          )}
        </div>
      </div>

      {invoice.status === 'void' && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl bg-slate-800 px-4 py-3 text-sm text-white dark:bg-slate-200 dark:text-slate-900">
          <Icon name="ban" className="h-4 w-4" />{t('Voided')}{invoice.voidReason ? `: ${invoice.voidReason}` : ''}. {t('Stock has been returned.')}
        </div>
      )}

      <div className="card mb-4 flex flex-wrap items-center justify-between gap-3 p-3">
        <Segmented size="sm" value={format} onChange={(f) => { setFormat(f); updateSettings({ printFormat: f }); }}
          options={[{ value: 'a4', label: 'A4' }, { value: 'thermal', label: t('Receipt 80mm') }]} />
        <ShareActions invoice={invoice} settings={settings} format={format} />
      </div>

      <div className="mb-4 flex flex-wrap gap-1">
        {invoice.status !== 'void' && (
          <Link to={`/invoices/${invoice.id}/edit`} className="btn-ghost btn-sm"><Icon name="edit" className="h-4 w-4" />{t('Edit')}</Link>
        )}
        <button type="button" className="btn-ghost btn-sm" onClick={onDuplicate}><Icon name="copy" className="h-4 w-4" />{t('Duplicate')}</button>
        {invoice.status === 'issued' && (
          <button type="button" className="btn-ghost btn-sm text-rose-600" onClick={onVoid}><Icon name="ban" className="h-4 w-4" />{t('Void')}</button>
        )}
        {(invoice.status === 'draft' || invoice.status === 'void') && (
          <button type="button" className="btn-ghost btn-sm text-rose-600" onClick={onDelete}>
            <Icon name="trash" className="h-4 w-4" />{invoice.status === 'void' ? t('Delete invoice') : t('Delete draft')}
          </button>
        )}
      </div>

      {/* On-screen preview: the paper is scaled down to fit narrow screens. */}
      <div className="overflow-hidden rounded-2xl bg-subtle p-3 sm:p-6">
        <PaperPreview format={format}>
          <InvoiceDocument invoice={invoice} settings={settings} format={format} />
        </PaperPreview>
      </div>

      <PrintPortal invoice={invoice} settings={settings} format={format} />
      <PaymentSheet open={payOpen} invoice={invoice} onClose={() => setPayOpen(false)} />
    </div>
  );
}

/** Scales the fixed-width paper to the available width (no sideways scrolling on phones). */
function PaperPreview({ format, children }) {
  const wrap = useRef(null);
  const inner = useRef(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState('auto');
  useEffect(() => {
    const measure = () => {
      if (!wrap.current || !inner.current) return;
      const paperW = inner.current.offsetWidth;
      const s = Math.min(1, wrap.current.clientWidth / paperW);
      setScale(s);
      setHeight(`${inner.current.offsetHeight * s}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap.current);
    ro.observe(inner.current);
    return () => ro.disconnect();
  }, [format]);
  return (
    <div ref={wrap} style={{ height }} className="relative">
      <div ref={inner} className="absolute start-1/2 top-0 w-fit shadow-pop" dir="ltr"
        style={{ transform: `translateX(-50%) scale(${scale})`, transformOrigin: 'top center' }}>
        {children}
      </div>
    </div>
  );
}
