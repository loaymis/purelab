/**
 * Checkout: customer, payment method(s), quick cash, change due, extra options.
 * The parent owns the invoice draft; this edits it via `update(patch)`.
 */
import React, { useEffect, useState } from 'react';
import { Icon, Sheet, Field, Combobox, Segmented } from '../ui.jsx';
import { useT } from '../../i18n/index.js';
import { money } from '../../lib/format.js';
import { round2 } from '../../lib/calc.js';
import { quickCashAmounts } from '../../lib/cash.js';
import { PAYMENT_METHODS, CUSTOMER_TYPES, useSettings } from '../../lib/settings.js';
import { saveCustomer } from '../../db/repo.js';
import { uuid } from '../../lib/ids.js';

const METHOD_ICONS = { cash: 'cash', card: 'card', transfer: 'bank', usdt: 'crypto', cheque: 'invoice', mobile: 'phone' };
const numeric = (v) => v.replace(/[^0-9.]/g, '');

function QuickCustomer({ open, onClose, onCreated }) {
  const t = useT();
  const [form, setForm] = useState({ name: '', phone: '', type: 'Retail' });
  useEffect(() => { if (open) setForm({ name: '', phone: '', type: 'Retail' }); }, [open]);
  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onCreated(await saveCustomer(form));
  };
  return (
    <Sheet open={open} size="sm" title={t('New customer')} onClose={onClose}
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>{t('Cancel')}</button><button type="submit" form="qc-form" className="btn-primary">{t('Create')}</button></>}>
      <form id="qc-form" onSubmit={submit} className="space-y-3">
        <Field label={t('Name')}><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label={t('Phone (for WhatsApp)')}><input className="input" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+971 50 123 4567" /></Field>
        <Field label={t('Type')}>
          <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {CUSTOMER_TYPES.map((x) => <option key={x} value={x}>{t(x)}</option>)}
          </select>
        </Field>
      </form>
    </Sheet>
  );
}

export default function CheckoutSheet({
  open, onClose, inv, update, totals, customers, balances, onComplete, onSaveDraft, busy, editingIssued,
}) {
  const t = useT();
  const settings = useSettings();
  const [newCustomer, setNewCustomer] = useState(false);
  const [more, setMore] = useState(false);

  // Start every checkout with a full cash payment pre-filled (the most common case).
  // If the cart changed since the last checkout, a single payment follows the new total.
  useEffect(() => {
    if (!open || editingIssued || !(totals.grandTotal > 0)) return;
    if (inv.payments.length === 0 && !inv._payLater) {
      update({ payments: [{ id: uuid(), method: 'cash', amount: totals.grandTotal, reference: '', date: inv.date }] });
    } else if (inv.payments.length === 1 && Number(inv.payments[0].amount) < totals.grandTotal) {
      update({ payments: [{ ...inv.payments[0], amount: totals.grandTotal }] });
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const payments = inv.payments;
  const primary = payments[0];
  const payLater = payments.length === 0;
  const customerOptions = (customers || []).map((c) => ({
    value: c.id, label: c.name,
    hint: [t(c.type), c.phone, (balances.get(c.id) || 0) > 0 ? `${t('owes')} ${money(balances.get(c.id))}` : ''].filter(Boolean).join(' · '),
  }));
  const remainingFor = (idx) => round2(Math.max(0, totals.grandTotal - payments.reduce((s, p, i) => (i === idx ? s : s + (Number(p.amount) || 0)), 0)));

  const setPayment = (idx, patch) => update({ payments: payments.map((p, i) => (i === idx ? { ...p, ...patch } : p)) });
  const chooseMethod = (method) => {
    if (payLater) update({ _payLater: false, payments: [{ id: uuid(), method, amount: totals.grandTotal, reference: '', date: inv.date }] });
    else setPayment(0, { method });
  };
  const addSplit = () => update({ payments: [...payments, { id: uuid(), method: 'card', amount: remainingFor(payments.length), reference: '', date: inv.date }] });

  const primaryMethod = PAYMENT_METHODS.find((m) => m.id === primary?.method);
  const quick = primary?.method === 'cash' ? quickCashAmounts(remainingFor(0)) : [remainingFor(0)];

  return (
    <>
      <Sheet open title={editingIssued ? t('Review & update') : t('Checkout')} onClose={onClose} size="lg"
        footer={(
          <div className="flex w-full flex-wrap items-center gap-2">
            {!editingIssued && <button type="button" className="btn-ghost" disabled={busy} onClick={onSaveDraft}>{t('Save draft')}</button>}
            <button type="button" className="btn-primary ms-auto min-w-[12rem] text-base" disabled={busy} onClick={onComplete}>
              {busy ? <Icon name="refresh" className="h-4 w-4 animate-spin" /> : <Icon name="check" className="h-5 w-5" />}
              {editingIssued ? t('Update invoice') : t('Complete sale')} · {money(totals.grandTotal)}
            </button>
          </div>
        )}>
        <div className="grid gap-5 lg:grid-cols-[1fr_17rem]">
          <div className="space-y-5">
            {/* Customer */}
            <section>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="label mb-0">{t('Customer')}</span>
                <button type="button" className="text-xs font-semibold text-accent" onClick={() => setNewCustomer(true)}>+ {t('New customer')}</button>
              </div>
              <Combobox value={inv.customerId} onChange={(customerId) => update({ customerId })} options={customerOptions}
                placeholder={t('Walk-in customer — search to pick')} emptyLabel={t('Walk-in customer')} ariaLabel={t('Customer')} />
            </section>

            {/* Payment method */}
            <section>
              <span className="label">{t('Payment method')}</span>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {PAYMENT_METHODS.map((m) => {
                  const active = !payLater && primary?.method === m.id;
                  return (
                    <button key={m.id} type="button" onClick={() => chooseMethod(m.id)}
                      className={`flex flex-col items-center gap-1 rounded-2xl border-2 px-2 py-3 text-xs font-semibold transition active:scale-95 ${
                        active ? 'border-brand-600 bg-brand-500/10 text-accent' : 'border-line text-muted hover:border-faint hover:text-ink'}`}>
                      <Icon name={METHOD_ICONS[m.id] || 'wallet'} className="h-5 w-5" />
                      <span className="text-center leading-tight">{t(m.label)}</span>
                    </button>
                  );
                })}
                <button type="button" onClick={() => update({ payments: [], _payLater: true })}
                  className={`flex flex-col items-center gap-1 rounded-2xl border-2 px-2 py-3 text-xs font-semibold transition active:scale-95 ${
                    payLater ? 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'border-line text-muted hover:border-faint hover:text-ink'}`}>
                  <Icon name="wallet" className="h-5 w-5" /><span className="text-center leading-tight">{t('Pay later')}</span>
                </button>
              </div>
            </section>

            {/* Amount */}
            {!payLater && primary && (
              <section className="space-y-3">
                <Field label={primary.method === 'cash' ? t('Cash received') : t('Amount')}>
                  <input className="input text-lg font-bold tabular-nums" inputMode="decimal" value={primary.amount}
                    onChange={(e) => setPayment(0, { amount: numeric(e.target.value) })} onFocus={(e) => e.target.select()} />
                </Field>
                <div className="flex flex-wrap gap-2">
                  {quick.map((v, i) => (
                    <button key={v} type="button" onClick={() => setPayment(0, { amount: v })}
                      className={`chip ${Number(primary.amount) === v ? 'chip-active' : ''}`}>
                      {i === 0 ? `${t('Exact')} · ${money(v)}` : money(v)}
                    </button>
                  ))}
                </div>
                {primaryMethod?.needsRef && (
                  <Field label={t(primaryMethod.refLabel)}>
                    <input className="input font-mono text-sm" value={primary.reference} onChange={(e) => setPayment(0, { reference: e.target.value })} />
                  </Field>
                )}
                {payments.slice(1).map((p, j) => {
                  const idx = j + 1;
                  const m = PAYMENT_METHODS.find((x) => x.id === p.method);
                  return (
                    <div key={p.id} className="space-y-2 rounded-2xl border border-line bg-subtle/50 p-3">
                      <div className="flex gap-2">
                        <select className="input" value={p.method} onChange={(e) => setPayment(idx, { method: e.target.value })} aria-label={t('Payment method')}>
                          {PAYMENT_METHODS.map((x) => <option key={x.id} value={x.id}>{t(x.label)}</option>)}
                        </select>
                        <input className="input w-32 font-semibold tabular-nums" inputMode="decimal" value={p.amount} aria-label={t('Amount')}
                          onChange={(e) => setPayment(idx, { amount: numeric(e.target.value) })} />
                        <button type="button" className="btn-icon text-muted hover:text-rose-600" aria-label={t('Remove')}
                          onClick={() => update({ payments: payments.filter((_, i) => i !== idx) })}><Icon name="trash" className="h-4 w-4" /></button>
                      </div>
                      {m?.needsRef && <input className="input font-mono text-xs" placeholder={t(m.refLabel)} value={p.reference} onChange={(e) => setPayment(idx, { reference: e.target.value })} />}
                    </div>
                  );
                })}
                <button type="button" className="text-sm font-semibold text-accent" onClick={addSplit}>+ {t('Split payment')}</button>
              </section>
            )}
            {payLater && (
              <p className="flex items-start gap-2 rounded-2xl bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
                <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0" />{t('The full amount is added to the customer’s balance. A customer must be selected.')}
              </p>
            )}

            {/* More options */}
            <section>
              <button type="button" className="flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink" onClick={() => setMore((v) => !v)}>
                <Icon name="chevronDown" className={`h-4 w-4 transition ${more ? 'rotate-180' : ''}`} />{t('More options')}
              </button>
              {more && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2 animate-fade-in">
                  <Field label={t('Date')}><input type="date" className="input" value={inv.date} onChange={(e) => update({ date: e.target.value })} /></Field>
                  <Field label={t('Due date')}><input type="date" className="input" value={inv.dueDate || ''} onChange={(e) => update({ dueDate: e.target.value })} /></Field>
                  <div className="sm:col-span-2">
                    <span className="label">{t('Invoice discount')}</span>
                    <div className="flex items-center gap-2">
                      <Segmented size="sm" value={inv.discountType} onChange={(discountType) => update({ discountType })}
                        options={[{ value: 'amount', label: settings.currency }, { value: 'percent', label: '%' }]} />
                      <input className="input" inputMode="decimal" value={inv.discountValue} aria-label={t('Discount')}
                        onChange={(e) => update({ discountValue: numeric(e.target.value) })} />
                    </div>
                  </div>
                  <Field label={t('Notes (printed on invoice)')} className="sm:col-span-2">
                    <textarea className="input" rows={2} value={inv.notes} onChange={(e) => update({ notes: e.target.value })} placeholder={t('e.g. prescription ref., delivery instructions')} />
                  </Field>
                </div>
              )}
            </section>
          </div>

          {/* Summary */}
          <aside className="h-fit space-y-2 rounded-2xl bg-subtle p-4 text-sm lg:sticky lg:top-0">
            <div className="flex justify-between text-muted"><span>{t('Subtotal')}</span><span className="tabular-nums">{money(totals.subtotal)}</span></div>
            {totals.lineDiscounts + totals.invoiceDiscount > 0 && (
              <div className="flex justify-between text-muted"><span>{t('Discounts')}</span><span className="tabular-nums">−{money(totals.lineDiscounts + totals.invoiceDiscount)}</span></div>
            )}
            {totals.tax > 0 && <div className="flex justify-between text-muted"><span>{t('VAT')}</span><span className="tabular-nums">{money(totals.tax)}</span></div>}
            <div className="flex items-end justify-between border-t border-line pt-2">
              <span className="font-semibold text-ink">{t('Total')}</span><span className="text-2xl font-bold tabular-nums text-ink">{money(totals.grandTotal)}</span>
            </div>
            {totals.changeDue > 0 && (
              <div className="mt-2 rounded-xl bg-emerald-500/15 p-3 text-center">
                <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">{t('Change due')}</div>
                <div className="text-3xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{money(totals.changeDue)}</div>
              </div>
            )}
            {totals.balance > 0 && (
              <div className="mt-2 rounded-xl bg-amber-500/15 p-3 text-center">
                <div className="text-xs font-semibold text-amber-700 dark:text-amber-300">{t('Balance due')}</div>
                <div className="text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-300">{money(totals.balance)}</div>
              </div>
            )}
          </aside>
        </div>
      </Sheet>
      <QuickCustomer open={newCustomer} onClose={() => setNewCustomer(false)}
        onCreated={(c) => { update({ customerId: c.id }); setNewCustomer(false); }} />
    </>
  );
}
