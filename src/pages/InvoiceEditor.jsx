/**
 * POS / Invoice editor. Used for new sales (/pos) and editing (/invoices/:id/edit).
 *
 * - Add products by camera scan, USB scanner, or search.
 * - Per-line qty / price / discount / VAT, invoice discount, split payments.
 * - Live totals; stock check against the ledger minus what is in the cart.
 * - Shortcuts: F2 search · F8 save draft · F9 issue & print.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ProductPicker from '../components/ProductPicker.jsx';
import { Icon, Modal, Field, PageHeader, EmptyState, useToast } from '../components/ui.jsx';
import { useCustomers, useInvoice, useStock, useBalances } from '../db/hooks.js';
import { saveInvoice, saveCustomer, newInvoiceDraft } from '../db/repo.js';
import { computeTotals, round2 } from '../lib/calc.js';
import { money, addDaysISO } from '../lib/format.js';
import { PAYMENT_METHODS, CUSTOMER_TYPES, useSettings } from '../lib/settings.js';
import { uuid } from '../lib/ids.js';

const lineKey = () => uuid().slice(0, 8);

function QtyStepper({ value, onChange }) {
  return (
    <div className="flex items-center rounded-lg border border-slate-300 bg-white">
      <button type="button" className="px-2.5 py-2 text-slate-600 hover:bg-slate-100" aria-label="Decrease quantity"
        onClick={() => onChange(Math.max(0, Number(value) - 1))}><Icon name="minus" className="h-4 w-4" /></button>
      <input className="w-12 border-0 bg-transparent p-0 text-center font-semibold focus:ring-0" inputMode="decimal"
        value={value} aria-label="Quantity"
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))} />
      <button type="button" className="px-2.5 py-2 text-slate-600 hover:bg-slate-100" aria-label="Increase quantity"
        onClick={() => onChange(Number(value) + 1)}><Icon name="plus" className="h-4 w-4" /></button>
    </div>
  );
}

function QuickCustomerModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', phone: '', type: 'Retail' });
  useEffect(() => { if (open) setForm({ name: '', phone: '', type: 'Retail' }); }, [open]);
  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const c = await saveCustomer(form);
    onCreated(c);
  };
  return (
    <Modal open={open} title="New customer" onClose={onClose} size="sm"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" form="quick-customer" className="btn-primary">Create</button></>}>
      <form id="quick-customer" onSubmit={submit} className="space-y-3">
        <Field label="Name"><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Phone"><input className="input" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
        <Field label="Type">
          <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {CUSTOMER_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
      </form>
    </Modal>
  );
}

export default function InvoiceEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const settings = useSettings();
  const customers = useCustomers();
  const balances = useBalances();
  const stock = useStock();
  const existing = useInvoice(id);

  const [inv, setInv] = useState(() => (id ? null : newInvoiceDraft()));
  const [originalQty, setOriginalQty] = useState(new Map());
  const [customerModal, setCustomerModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const pickerWrap = useRef(null);

  // Load an existing invoice once.
  useEffect(() => {
    if (!id || inv || existing === undefined) return;
    if (!existing || existing.deleted) { navigate('/invoices', { replace: true }); return; }
    if (existing.status === 'void') { navigate(`/invoices/${id}`, { replace: true }); return; }
    setInv({ ...existing, items: existing.items.map((i) => ({ ...i, key: i.key || lineKey() })) });
    if (existing.status === 'issued') {
      const m = new Map();
      existing.items.forEach((i) => m.set(i.productId, (m.get(i.productId) || 0) + Number(i.qty)));
      setOriginalQty(m);
    }
  }, [id, existing, inv, navigate]);

  const update = (patch) => setInv((cur) => ({ ...cur, ...patch }));
  const updateItem = (key, patch) => setInv((cur) => ({
    ...cur, items: cur.items.map((i) => (i.key === key ? { ...i, ...patch } : i)),
  }));
  const removeItem = (key) => setInv((cur) => ({ ...cur, items: cur.items.filter((i) => i.key !== key) }));

  const addProduct = useCallback((p, extra = {}) => {
    setInv((cur) => {
      const batch = extra.batchNumber || p.batchNumber || '';
      const idx = cur.items.findIndex((i) => i.productId === p.id && (i.batchNumber || '') === batch);
      if (idx >= 0) {
        const items = [...cur.items];
        items[idx] = { ...items[idx], qty: Number(items[idx].qty) + 1 };
        return { ...cur, items };
      }
      return {
        ...cur,
        items: [...cur.items, {
          key: lineKey(), productId: p.id, sku: p.sku, name: p.name, batchNumber: batch,
          expiryDate: extra.expiry || p.expiryDate || '', qty: 1, price: p.price,
          discountPct: 0, taxRate: p.taxRate ?? settings.defaultTaxRate,
        }],
      };
    });
  }, [settings.defaultTaxRate]);

  const totals = useMemo(() => (inv ? computeTotals(inv.items, inv, inv.payments) : null), [inv]);

  const cartQty = useMemo(() => {
    const m = new Map();
    inv?.items.forEach((i) => m.set(i.productId, (m.get(i.productId) || 0) + (Number(i.qty) || 0)));
    return m;
  }, [inv]);

  // Stock the picker sees: ledger + what this (already issued) invoice deducted.
  const effectiveStock = useMemo(() => {
    const m = new Map(stock);
    originalQty.forEach((q, pid) => m.set(pid, (m.get(pid) || 0) + q));
    return m;
  }, [stock, originalQty]);

  const shortages = useMemo(() => {
    const out = new Set();
    cartQty.forEach((q, pid) => { if (q > (effectiveStock.get(pid) || 0)) out.add(pid); });
    return out;
  }, [cartQty, effectiveStock]);

  /* -------------------------------------------------------------- payments */
  const addPayment = (method = 'cash', amount) => {
    const remaining = Math.max(0, round2(totals.grandTotal - totals.tendered));
    update({ payments: [...inv.payments, { id: uuid(), method, amount: amount ?? remaining, reference: '', date: inv.date }] });
  };
  const updatePayment = (pid, patch) => update({ payments: inv.payments.map((p) => (p.id === pid ? { ...p, ...patch } : p)) });
  const removePayment = (pid) => update({ payments: inv.payments.filter((p) => p.id !== pid) });

  /* ------------------------------------------------------------------ save */
  const save = async (status, { print = false } = {}) => {
    if (saving) return;
    if (!inv.items.some((i) => Number(i.qty) > 0)) { toast('Add at least one product', 'error'); return; }
    if (status === 'issued') {
      if (totals.balance > 0 && !inv.customerId) {
        toast('Select a customer for credit / partially paid invoices', 'error');
        return;
      }
      const missingRef = inv.payments.find((p) => PAYMENT_METHODS.find((m) => m.id === p.method)?.needsRef && !p.reference?.trim());
      if (missingRef && !window.confirm('Some non-cash payments have no reference. Issue anyway?')) return;
      if (shortages.size && !window.confirm('Some items exceed available stock. Issue anyway (stock will go negative)?')) return;
      const customer = customers?.find((c) => c.id === inv.customerId);
      if (customer?.creditLimit > 0) {
        const prevOwed = (balances.get(customer.id) || 0) - (existing?.status === 'issued' ? existing.totals?.balance || 0 : 0);
        if (prevOwed + totals.balance > customer.creditLimit) toast(`Credit limit of ${money(customer.creditLimit)} exceeded`, 'warn');
      }
    }
    setSaving(true);
    try {
      const dueDate = inv.dueDate || (Number(inv.paymentTermsDays) > 0 ? addDaysISO(inv.date, inv.paymentTermsDays) : '');
      const payments = inv.payments.filter((p) => Number(p.amount) > 0);
      const saved = await saveInvoice({ ...inv, dueDate, payments }, status);
      toast(status === 'issued' ? `Invoice ${saved.number} issued` : `Draft ${saved.number} saved`);
      navigate(`/invoices/${saved.id}`, { replace: !!id, state: { autoPrint: print } });
    } catch (err) {
      toast(err.message || 'Could not save invoice', 'error');
      setSaving(false);
    }
  };

  // Keyboard shortcuts (desktop).
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'F2') { e.preventDefault(); pickerWrap.current?.querySelector('input')?.focus(); }
      if (e.key === 'F8') { e.preventDefault(); saveRef.current('draft'); }
      if (e.key === 'F9') { e.preventDefault(); saveRef.current('issued', { print: true }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!inv || customers === undefined) return <div className="p-8 text-center text-slate-500">Loading…</div>;

  const selectedCustomer = customers.find((c) => c.id === inv.customerId);
  const editingIssued = existing?.status === 'issued';

  return (
    <div>
      <PageHeader
        title={id ? `Edit ${inv.number}` : 'New Sale'}
        subtitle={editingIssued ? 'Editing an issued invoice — stock will be re-calculated on save.' : 'Scan or search products to build the invoice.'}
        actions={<span className="hidden text-xs text-slate-400 lg:inline">F2 search · F8 draft · F9 issue & print</span>}
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        {/* ---------------------------------------------------------- items */}
        <section className="space-y-4">
          <div ref={pickerWrap} className="card p-3"><ProductPicker onAdd={addProduct} stock={effectiveStock} inCart={cartQty} /></div>

          <div className="card">
            {inv.items.length === 0 ? (
              <EmptyState icon="scan" title="No items yet" text="Scan a barcode with the camera or a USB scanner, or search by name / SKU." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {inv.items.map((it, idx) => {
                  const short = shortages.has(it.productId);
                  return (
                    <li key={it.key} className="p-3 sm:p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900">{it.name}</div>
                          <div className="text-xs text-slate-500">
                            {it.sku}{it.batchNumber ? ` · Batch ${it.batchNumber}` : ''}{it.expiryDate ? ` · Exp ${it.expiryDate}` : ''}
                          </div>
                          {short && (
                            <div className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-rose-600">
                              <Icon name="alert" className="h-3.5 w-3.5" /> Only {effectiveStock.get(it.productId) || 0} in stock
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-slate-900">{money(totals.lineTotals[idx] ?? 0)}</div>
                          <button type="button" className="mt-1 text-xs text-rose-600 hover:underline" onClick={() => removeItem(it.key)}>Remove</button>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <div><span className="label">Qty</span><QtyStepper value={it.qty} onChange={(v) => updateItem(it.key, { qty: v })} /></div>
                        <Field label="Unit price">
                          <input className="input" inputMode="decimal" value={it.price}
                            onChange={(e) => updateItem(it.key, { price: e.target.value.replace(/[^0-9.]/g, '') })} />
                        </Field>
                        <Field label="Disc. %">
                          <input className="input" inputMode="decimal" value={it.discountPct}
                            onChange={(e) => updateItem(it.key, { discountPct: e.target.value.replace(/[^0-9.]/g, '') })} />
                        </Field>
                        <Field label="VAT %">
                          <input className="input" inputMode="decimal" value={it.taxRate}
                            onChange={(e) => updateItem(it.key, { taxRate: e.target.value.replace(/[^0-9.]/g, '') })} />
                        </Field>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="card p-4">
            <Field label="Notes (printed on invoice)">
              <textarea className="input" rows={2} value={inv.notes} onChange={(e) => update({ notes: e.target.value })}
                placeholder="e.g. Prescription ref., delivery instructions" />
            </Field>
          </div>
        </section>

        {/* -------------------------------------------------------- summary */}
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <div className="card space-y-3 p-4">
            <div className="flex items-end gap-2">
              <Field label="Customer" className="flex-1">
                <select className="input" value={inv.customerId || ''} onChange={(e) => update({ customerId: e.target.value || null })}>
                  <option value="">Walk-in customer</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
                </select>
              </Field>
              <button type="button" className="btn-secondary px-3" onClick={() => setCustomerModal(true)} aria-label="New customer">
                <Icon name="plus" />
              </button>
            </div>
            {selectedCustomer && (
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                {selectedCustomer.type} · Balance {money(balances.get(selectedCustomer.id) || 0)}
                {selectedCustomer.creditLimit > 0 && ` / limit ${money(selectedCustomer.creditLimit)}`}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Field label="Date"><input type="date" className="input" value={inv.date} onChange={(e) => update({ date: e.target.value })} /></Field>
              <Field label="Due date"><input type="date" className="input" value={inv.dueDate || ''} onChange={(e) => update({ dueDate: e.target.value })} /></Field>
            </div>
            <div>
              <span className="label">Invoice discount</span>
              <div className="flex gap-2">
                <select className="input w-24" value={inv.discountType} onChange={(e) => update({ discountType: e.target.value })} aria-label="Discount type">
                  <option value="amount">{settings.currency}</option>
                  <option value="percent">%</option>
                </select>
                <input className="input" inputMode="decimal" value={inv.discountValue} aria-label="Discount value"
                  onChange={(e) => update({ discountValue: e.target.value.replace(/[^0-9.]/g, '') })} />
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="label mb-0">Payments</span>
              <button type="button" className="btn-ghost btn-sm" onClick={() => addPayment()}><Icon name="plus" className="h-4 w-4" /> Add</button>
            </div>
            {inv.payments.length === 0 && (
              <div className="flex flex-wrap gap-2">
                {PAYMENT_METHODS.slice(0, 4).map((m) => (
                  <button key={m.id} type="button" className="btn-secondary btn-sm" onClick={() => addPayment(m.id)}>{m.label}</button>
                ))}
              </div>
            )}
            <div className="space-y-3">
              {inv.payments.map((p) => {
                const method = PAYMENT_METHODS.find((m) => m.id === p.method);
                return (
                  <div key={p.id} className="space-y-2 rounded-lg border border-slate-200 p-2.5">
                    <div className="flex gap-2">
                      <select className="input" value={p.method} onChange={(e) => updatePayment(p.id, { method: e.target.value })} aria-label="Payment method">
                        {PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                      </select>
                      <input className="input w-32" inputMode="decimal" value={p.amount} aria-label="Amount"
                        onChange={(e) => updatePayment(p.id, { amount: e.target.value.replace(/[^0-9.]/g, '') })} />
                      <button type="button" className="rounded-lg px-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => removePayment(p.id)} aria-label="Remove payment">
                        <Icon name="trash" className="h-4 w-4" />
                      </button>
                    </div>
                    {method?.needsRef && (
                      <input className="input font-mono text-xs" value={p.reference} placeholder={method.refLabel}
                        onChange={(e) => updatePayment(p.id, { reference: e.target.value })} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card p-4">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Subtotal ({totals.itemCount} items)</dt><dd>{money(totals.subtotal)}</dd></div>
              {totals.lineDiscounts > 0 && <div className="flex justify-between"><dt className="text-slate-500">Line discounts</dt><dd>−{money(totals.lineDiscounts)}</dd></div>}
              {totals.invoiceDiscount > 0 && <div className="flex justify-between"><dt className="text-slate-500">Invoice discount</dt><dd>−{money(totals.invoiceDiscount)}</dd></div>}
              <div className="flex justify-between"><dt className="text-slate-500">VAT</dt><dd>{money(totals.tax)}</dd></div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-lg font-bold"><dt>Total</dt><dd>{money(totals.grandTotal)}</dd></div>
              {totals.tendered > 0 && <div className="flex justify-between"><dt className="text-slate-500">Paid</dt><dd>{money(totals.paid)}</dd></div>}
              {totals.changeDue > 0 && <div className="flex justify-between font-semibold text-emerald-700"><dt>Change due</dt><dd>{money(totals.changeDue)}</dd></div>}
              {totals.balance > 0 && totals.tendered > 0 && <div className="flex justify-between font-semibold text-amber-700"><dt>Balance due</dt><dd>{money(totals.balance)}</dd></div>}
            </dl>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" className="btn-secondary" disabled={saving || editingIssued} onClick={() => save('draft')}
                title={editingIssued ? 'Issued invoices cannot go back to draft' : 'Save as draft (F8)'}>Save draft</button>
              <button type="button" className="btn-primary" disabled={saving} onClick={() => save('issued', { print: true })} title="Issue & print (F9)">
                <Icon name="printer" className="h-4 w-4" /> {editingIssued ? 'Update' : 'Issue'}
              </button>
            </div>
          </div>
        </aside>
      </div>

      <QuickCustomerModal open={customerModal} onClose={() => setCustomerModal(false)}
        onCreated={(c) => { update({ customerId: c.id }); setCustomerModal(false); toast(`Customer ${c.name} added`); }} />
    </div>
  );
}
