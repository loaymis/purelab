/**
 * Checkout: customer, Cash or Pay later, quick cash, change due, extra options.
 * The parent owns the invoice draft; this edits it via `update(patch)`.
 */
import React, { useEffect, useState } from 'react';
import { Icon, Sheet, Field, Combobox, Segmented } from '../ui.jsx';
import { useT } from '../../i18n/index.js';
import { money } from '../../lib/format.js';
import { quickCashAmounts } from '../../lib/cash.js';
import { PAYMENT_METHODS, CUSTOMER_TYPES, useSettings } from '../../lib/settings.js';
import { saveCustomer } from '../../db/repo.js';
import { uuid } from '../../lib/ids.js';

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
        <Field label={t('Phone (for WhatsApp)')}><input className="input" type="tel" dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+971 50 123 4567" /></Field>
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

  // New sales start as a full cash payment; if the cart changed, the cash amount follows the total.
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
  const cash = payments.find((p) => p.method === 'cash');
  const others = payments.filter((p) => p !== cash); // older invoices may hold card/transfer payments
  const payLater = !cash;
  const othersTotal = others.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const cashDue = Math.max(0, Math.round((totals.grandTotal - othersTotal) * 100) / 100);

  const setMode = (mode) => {
    if (mode === 'later') update({ payments: others, _payLater: true });
    else if (!cash) update({ _payLater: false, payments: [{ id: uuid(), method: 'cash', amount: cashDue, reference: '', date: inv.date }, ...others] });
  };
  const setCash = (amount) => update({ payments: payments.map((p) => (p === cash ? { ...p, amount } : p)) });

  const customerOptions = (customers || []).map((c) => ({
    value: c.id, label: c.name,
    hint: [t(c.type), c.phone, (balances.get(c.id) || 0) > 0 ? `${t('owes')} ${money(balances.get(c.id))}` : ''].filter(Boolean).join(' · '),
  }));

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
            {/* Payment: Cash or Pay later */}
            <section>
              <span className="label">{t('Payment')}</span>
              <Segmented value={payLater ? 'later' : 'cash'} onChange={setMode} ariaLabel={t('Payment')} options={[
                { value: 'cash', label: t('Cash'), icon: 'cash' },
                { value: 'later', label: t('Pay later'), icon: 'wallet' },
              ]} />
            </section>

            {!payLater && (
              <section className="space-y-3">
                <Field label={t('Cash received')}>
                  <input className="input text-lg font-bold tabular-nums" inputMode="decimal" value={cash.amount}
                    onChange={(e) => setCash(numeric(e.target.value))} onFocus={(e) => e.target.select()} />
                </Field>
                <div className="flex flex-wrap gap-2">
                  {quickCashAmounts(cashDue).map((v, i) => (
                    <button key={v} type="button" onClick={() => setCash(v)} className={`chip ${Number(cash.amount) === v ? 'chip-active' : ''}`}>
                      {i === 0 ? `${t('Exact')} · ${money(v)}` : money(v)}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Customer (required for pay later) */}
            <section>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="label mb-0">{t('Customer')}{payLater && <span className="text-rose-600"> *</span>}</span>
                <button type="button" className="text-xs font-semibold text-accent" onClick={() => setNewCustomer(true)}>+ {t('New customer')}</button>
              </div>
              <Combobox value={inv.customerId} onChange={(customerId) => update({ customerId })} options={customerOptions}
                placeholder={t('Walk-in customer — search to pick')} emptyLabel={t('Walk-in customer')} ariaLabel={t('Customer')} />
              {payLater && (
                <p className="mt-2 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
                  <Icon name="info" className="mt-0.5 h-3.5 w-3.5 shrink-0" />{t('The full amount is added to the customer’s balance. A customer must be selected.')}
                </p>
              )}
            </section>

            {others.length > 0 && (
              <section className="rounded-2xl bg-subtle p-3 text-sm">
                <div className="label">{t('Earlier payments')}</div>
                {others.map((p) => (
                  <div key={p.id} className="flex justify-between text-muted">
                    <span>{t(PAYMENT_METHODS.find((m) => m.id === p.method)?.label || p.method)}</span><span className="tabular-nums">{money(p.amount)}</span>
                  </div>
                ))}
              </section>
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
                <div className="text-xs font-semibold text-amber-700 dark:text-amber-300">{payLater ? t('On credit') : t('Balance due')}</div>
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
