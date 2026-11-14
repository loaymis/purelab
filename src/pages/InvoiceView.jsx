/** Invoice preview with print, PDF export, payments, void, duplicate. */
import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import InvoiceDocument, { PrintPortal } from '../components/InvoiceDocument.jsx';
import { Icon, Modal, Field, StatusBadge, useToast } from '../components/ui.jsx';
import { useInvoice } from '../db/hooks.js';
import { addPayment, voidInvoice, deleteDraft, saveInvoice } from '../db/repo.js';
import { paymentStatus } from '../lib/calc.js';
import { money, todayISO } from '../lib/format.js';
import { printDocument, exportPDF } from '../lib/print.js';
import { PAYMENT_METHODS, useSettings, updateSettings } from '../lib/settings.js';
import { desktop } from '../lib/platform.js';

function PaymentModal({ open, invoice, onClose }) {
  const toast = useToast();
  const [form, setForm] = useState({ method: 'cash', amount: '', reference: '', date: todayISO() });
  useEffect(() => {
    if (open) setForm({ method: 'cash', amount: String(invoice.totals?.balance || ''), reference: '', date: todayISO() });
  }, [open, invoice]);
  const method = PAYMENT_METHODS.find((m) => m.id === form.method);
  const submit = async (e) => {
    e.preventDefault();
    if (!(Number(form.amount) > 0)) return;
    await addPayment(invoice.id, form);
    toast(`Payment of ${money(form.amount)} recorded`);
    onClose();
  };
  return (
    <Modal open={open} title={`Record payment — ${invoice.number}`} onClose={onClose} size="sm"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" form="pay-form" className="btn-primary">Save payment</button></>}>
      <form id="pay-form" onSubmit={submit} className="space-y-3">
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Balance due: <b>{money(invoice.totals?.balance)}</b></div>
        <Field label="Method">
          <select className="input" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
            {PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </Field>
        <Field label="Amount"><input className="input" inputMode="decimal" required value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^0-9.]/g, '') })} /></Field>
        {method?.needsRef && (
          <Field label={method.refLabel}><input className="input font-mono" value={form.reference}
            onChange={(e) => setForm({ ...form, reference: e.target.value })} /></Field>
        )}
        <Field label="Date"><input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
      </form>
    </Modal>
  );
}

export default function InvoiceView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const settings = useSettings();
  const invoice = useInvoice(id);
  const [format, setFormat] = useState(settings.printFormat);
  const [payOpen, setPayOpen] = useState(false);
  const autoPrinted = useRef(false);

  const fileName = invoice ? `${invoice.number}${invoice.customer ? ` - ${invoice.customer.name}` : ''}.pdf` : 'invoice.pdf';

  const onPrint = async () => {
    const res = await printDocument(format);
    if (res && res.success === false && res.failureReason && res.failureReason !== 'cancelled') toast(`Print failed: ${res.failureReason}`, 'error');
  };

  const onPdf = async () => {
    const res = await exportPDF(format, fileName);
    if (res?.saved && res.filePath) {
      toast('PDF saved');
      desktop?.openFile(res.filePath);
    }
  };

  // "Issue & print" from the POS lands here with autoPrint.
  useEffect(() => {
    if (invoice && location.state?.autoPrint && !autoPrinted.current) {
      autoPrinted.current = true;
      navigate(location.pathname, { replace: true, state: {} });
      setTimeout(onPrint, 300);
    }
  }); // eslint-disable-line react-hooks/exhaustive-deps

  if (invoice === undefined) return <div className="p-8 text-center text-slate-500">Loading…</div>;
  if (!invoice || invoice.deleted) {
    return <div className="p-8 text-center text-slate-500">Invoice not found. <Link className="text-brand-700 underline" to="/invoices">Back to invoices</Link></div>;
  }

  const status = paymentStatus(invoice);

  const onVoid = async () => {
    const reason = window.prompt('Reason for voiding this invoice? Stock will be returned.');
    if (reason === null) return;
    await voidInvoice(invoice.id, reason);
    toast(`Invoice ${invoice.number} voided`, 'warn');
  };

  const onDelete = async () => {
    if (!window.confirm('Delete this draft?')) return;
    await deleteDraft(invoice.id);
    toast('Draft deleted');
    navigate('/invoices', { replace: true });
  };

  const onDuplicate = async () => {
    const { id: _id, number, totals, payments, issuedAt, created_at, updated_at, voidReason, voidedAt, ...rest } = invoice;
    const copy = await saveInvoice({ ...rest, id: null, number: '', payments: [], date: todayISO(), dueDate: '' }, 'draft');
    navigate(`/invoices/${copy.id}/edit`);
  };

  const onIssueDraft = async () => {
    await saveInvoice(invoice, 'issued');
    toast(`Invoice ${invoice.number} issued`);
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button type="button" className="btn-ghost px-2" onClick={() => navigate('/invoices')} aria-label="Back">
            <Icon name="chevronLeft" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold sm:text-2xl">{invoice.number}</h1>
              <StatusBadge status={status} />
            </div>
            <p className="text-sm text-slate-500">
              {invoice.customer?.name || 'Walk-in'} · {money(invoice.totals?.grandTotal)}
              {invoice.totals?.balance > 0 && invoice.status === 'issued' && <> · <b className="text-amber-700">{money(invoice.totals.balance)} due</b></>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
            {['a4', 'thermal'].map((f) => (
              <button key={f} type="button" onClick={() => { setFormat(f); updateSettings({ printFormat: f }); }}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${format === f ? 'bg-brand-700 text-white' : 'text-slate-600'}`}>
                {f === 'a4' ? 'A4' : 'Receipt 80mm'}
              </button>
            ))}
          </div>
          <button type="button" className="btn-secondary" onClick={onPrint}><Icon name="printer" className="h-4 w-4" /> Print</button>
          <button type="button" className="btn-secondary" onClick={onPdf}><Icon name="download" className="h-4 w-4" /> PDF</button>
          {invoice.status === 'issued' && invoice.totals?.balance > 0 && (
            <button type="button" className="btn-primary" onClick={() => setPayOpen(true)}><Icon name="wallet" className="h-4 w-4" /> Payment</button>
          )}
          {invoice.status === 'draft' && (
            <button type="button" className="btn-primary" onClick={onIssueDraft}><Icon name="check" className="h-4 w-4" /> Issue</button>
          )}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {invoice.status !== 'void' && (
          <Link to={`/invoices/${invoice.id}/edit`} className="btn-ghost btn-sm"><Icon name="edit" className="h-4 w-4" /> Edit</Link>
        )}
        <button type="button" className="btn-ghost btn-sm" onClick={onDuplicate}><Icon name="copy" className="h-4 w-4" /> Duplicate</button>
        {invoice.status === 'issued' && (
          <button type="button" className="btn-ghost btn-sm text-rose-600" onClick={onVoid}><Icon name="ban" className="h-4 w-4" /> Void</button>
        )}
        {invoice.status === 'draft' && (
          <button type="button" className="btn-ghost btn-sm text-rose-600" onClick={onDelete}><Icon name="trash" className="h-4 w-4" /> Delete draft</button>
        )}
      </div>

      {invoice.status === 'void' && (
        <div className="mb-4 rounded-lg bg-slate-800 px-4 py-3 text-sm text-white">
          Voided{invoice.voidReason ? `: ${invoice.voidReason}` : ''}. Stock has been returned.
        </div>
      )}

      {/* On-screen preview (scrolls horizontally on phones). */}
      <div className="overflow-x-auto rounded-xl bg-slate-200 p-3 sm:p-6">
        <div className={format === 'thermal' ? 'w-fit mx-auto shadow-lg' : 'w-fit mx-auto origin-top shadow-lg'}>
          <InvoiceDocument invoice={invoice} settings={settings} format={format} />
        </div>
      </div>

      <PrintPortal invoice={invoice} settings={settings} format={format} />
      <PaymentModal open={payOpen} invoice={invoice} onClose={() => setPayOpen(false)} />
    </div>
  );
}
