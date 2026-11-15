/** Customer database with live outstanding balances. */
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Icon, Sheet, Field, PageHeader, EmptyState, ListSkeleton, Avatar, Fab, useToast,
} from '../components/ui.jsx';
import { useCustomers, useBalances } from '../db/hooks.js';
import { saveCustomer } from '../db/repo.js';
import { CUSTOMER_TYPES } from '../lib/settings.js';
import { money } from '../lib/format.js';
import { useT } from '../i18n/index.js';

const EMPTY = { name: '', type: 'Retail', phone: '', email: '', address: '', taxId: '', creditLimit: '', openingBalance: '', notes: '' };

export function CustomerForm({ open, customer, onClose }) {
  const t = useT();
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  useEffect(() => { if (open) setForm(customer ? { ...EMPTY, ...customer } : EMPTY); }, [open, customer]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    await saveCustomer(form);
    toast(customer ? t('Customer updated') : t('Customer created'));
    onClose();
  };
  return (
    <Sheet open={open} title={customer ? t('Edit customer') : t('New customer')} onClose={onClose} size="lg"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>{t('Cancel')}</button>
        <button type="submit" form="customer-form" className="btn-primary">{t('Save')}</button></>}>
      <form id="customer-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label={t('Name / business name')} className="sm:col-span-2"><input className="input" required value={form.name} onChange={set('name')} /></Field>
        <Field label={t('Type')}><select className="input" value={form.type} onChange={set('type')}>{CUSTOMER_TYPES.map((x) => <option key={x} value={x}>{t(x)}</option>)}</select></Field>
        <Field label={t('Tax ID / pharmacy licence')}><input className="input" value={form.taxId} onChange={set('taxId')} /></Field>
        <Field label={t('Phone (for WhatsApp)')}><input className="input" type="tel" dir="ltr" value={form.phone} onChange={set('phone')} placeholder="+971 50 123 4567" /></Field>
        <Field label={t('Email')}><input className="input" type="email" dir="ltr" value={form.email} onChange={set('email')} /></Field>
        <Field label={t('Address')} className="sm:col-span-2"><textarea className="input" rows={2} value={form.address} onChange={set('address')} /></Field>
        <Field label={t('Credit limit')} hint={t('0 = no limit')}><input className="input" inputMode="decimal" value={form.creditLimit} onChange={set('creditLimit')} /></Field>
        <Field label={t('Opening balance')} hint={t('Amount owed before using PureLab')}><input className="input" inputMode="decimal" value={form.openingBalance} onChange={set('openingBalance')} /></Field>
        <Field label={t('Notes')} className="sm:col-span-2"><textarea className="input" rows={2} value={form.notes} onChange={set('notes')} /></Field>
      </form>
    </Sheet>
  );
}

export default function Customers() {
  const t = useT();
  const customers = useCustomers();
  const balances = useBalances();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [type, setType] = useState('All');
  const [owing, setOwing] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (params.get('new')) { setOpen(true); setParams({}, { replace: true }); }
  }, [params, setParams]);

  const rows = useMemo(() => {
    if (!customers) return [];
    const needle = q.trim().toLowerCase();
    return customers.filter((c) => (type === 'All' || c.type === type)
      && (!owing || (balances.get(c.id) || 0) > 0)
      && (!needle || [c.name, c.phone, c.email, c.taxId].some((v) => String(v || '').toLowerCase().includes(needle))));
  }, [customers, q, type, owing, balances]);

  const totalOwed = [...balances.values()].reduce((s, v) => s + Math.max(0, v), 0);

  return (
    <div>
      <PageHeader title={t('Customers')} subtitle={customers ? t('{n} customers · {amount} receivable', { n: customers.length, amount: money(totalOwed) }) : ''}
        actions={<button type="button" className="btn-primary hidden lg:inline-flex" onClick={() => setOpen(true)}><Icon name="plus" className="h-4 w-4" />{t('Add customer')}</button>} />

      <div className="sticky top-[57px] z-10 -mx-4 mb-4 space-y-3 bg-canvas/95 px-4 py-2 backdrop-blur-lg lg:top-0 lg:mx-0 lg:px-0">
        <div className="relative">
          <Icon name="search" className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input className="input ps-9" placeholder={t('Search name, phone, email, tax ID…')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
          <button type="button" onClick={() => setOwing((v) => !v)} className={`chip ${owing ? 'chip-active' : ''}`}><Icon name="wallet" className="h-4 w-4" />{t('Owes money')}</button>
          <span className="mx-1 w-px shrink-0 bg-line" />
          {['All', ...CUSTOMER_TYPES].map((x) => (
            <button key={x} type="button" onClick={() => setType(x)} className={`chip ${type === x ? 'chip-active' : ''}`}>{t(x)}</button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        {customers === undefined ? <ListSkeleton />
          : rows.length === 0 ? (
            <EmptyState icon="users" title={customers.length ? t('No customers match') : t('No customers yet')}
              text={customers.length ? t('Try another search or filter.') : t('Pharmacies, clinics and retail clients appear here.')}
              action={!customers.length && <button type="button" className="btn-primary" onClick={() => setOpen(true)}>{t('Add customer')}</button>} />
          ) : (
            <ul className="divide-y divide-line">
              {rows.map((c) => {
                const bal = balances.get(c.id) || 0;
                return (
                  <li key={c.id}>
                    <Link to={`/customers/${c.id}`} className="flex items-center justify-between gap-3 p-4 transition hover:bg-subtle">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={c.name} />
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-ink">{c.name}</div>
                          <div className="truncate text-xs text-muted">{t(c.type)}{c.phone ? <> · <span dir="ltr">{c.phone}</span></> : ''}</div>
                        </div>
                      </div>
                      <div className="text-end">
                        <div className={`font-bold tabular-nums ${bal > 0 ? 'text-amber-600' : 'text-faint'}`}>{money(bal)}</div>
                        <div className="text-xs text-faint">{t('balance')}</div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
      </div>
      <Fab label={t('Add customer')} onClick={() => setOpen(true)} />
      <CustomerForm open={open} customer={null} onClose={() => setOpen(false)} />
    </div>
  );
}
