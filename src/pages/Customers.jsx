/** Customer database with live outstanding balances. */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, Modal, Field, PageHeader, EmptyState, useToast } from '../components/ui.jsx';
import { useCustomers, useBalances } from '../db/hooks.js';
import { saveCustomer } from '../db/repo.js';
import { CUSTOMER_TYPES } from '../lib/settings.js';
import { money } from '../lib/format.js';

const EMPTY = { name: '', type: 'Retail', phone: '', email: '', address: '', taxId: '', creditLimit: '', openingBalance: '', notes: '' };

export function CustomerForm({ open, customer, onClose }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  useEffect(() => { if (open) setForm(customer ? { ...EMPTY, ...customer } : EMPTY); }, [open, customer]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    await saveCustomer(form);
    toast(customer ? 'Customer updated' : 'Customer created');
    onClose();
  };
  return (
    <Modal open={open} title={customer ? `Edit ${customer.name}` : 'New customer'} onClose={onClose} size="lg"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" form="customer-form" className="btn-primary">Save</button></>}>
      <form id="customer-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Name / Business name" className="sm:col-span-2"><input className="input" required value={form.name} onChange={set('name')} /></Field>
        <Field label="Type"><select className="input" value={form.type} onChange={set('type')}>{CUSTOMER_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Tax ID / Pharmacy licence"><input className="input" value={form.taxId} onChange={set('taxId')} /></Field>
        <Field label="Phone"><input className="input" type="tel" value={form.phone} onChange={set('phone')} /></Field>
        <Field label="Email"><input className="input" type="email" value={form.email} onChange={set('email')} /></Field>
        <Field label="Address" className="sm:col-span-2"><textarea className="input" rows={2} value={form.address} onChange={set('address')} /></Field>
        <Field label="Credit limit" hint="0 = no limit"><input className="input" inputMode="decimal" value={form.creditLimit} onChange={set('creditLimit')} /></Field>
        <Field label="Opening balance" hint="Amount owed before using PureLab"><input className="input" inputMode="decimal" value={form.openingBalance} onChange={set('openingBalance')} /></Field>
        <Field label="Notes" className="sm:col-span-2"><textarea className="input" rows={2} value={form.notes} onChange={set('notes')} /></Field>
      </form>
    </Modal>
  );
}

export default function Customers() {
  const customers = useCustomers();
  const balances = useBalances();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);

  const rows = useMemo(() => {
    if (!customers) return [];
    const needle = q.trim().toLowerCase();
    return customers.filter((c) => !needle || [c.name, c.phone, c.email, c.taxId].some((v) => String(v || '').toLowerCase().includes(needle)));
  }, [customers, q]);

  const totalOwed = [...balances.values()].reduce((s, v) => s + Math.max(0, v), 0);

  return (
    <div>
      <PageHeader title="Customers" subtitle={customers ? `${customers.length} customers · ${money(totalOwed)} receivable` : ''}
        actions={<button type="button" className="btn-primary" onClick={() => setOpen(true)}><Icon name="plus" className="h-4 w-4" /> Add customer</button>} />
      <div className="relative mb-4">
        <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input className="input pl-9" placeholder="Search name, phone, email, tax ID…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="card overflow-hidden">
        {customers === undefined ? <div className="p-8 text-center text-slate-500">Loading…</div>
          : rows.length === 0 ? <EmptyState icon="users" title="No customers" text="Pharmacies, clinics and retail clients appear here." />
            : (
              <ul className="divide-y divide-slate-100">
                {rows.map((c) => {
                  const bal = balances.get(c.id) || 0;
                  return (
                    <li key={c.id}>
                      <Link to={`/customers/${c.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-slate-50">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-800">
                            {c.name.slice(0, 1).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-slate-900">{c.name}</div>
                            <div className="truncate text-xs text-slate-500">{c.type}{c.phone ? ` · ${c.phone}` : ''}{c.email ? ` · ${c.email}` : ''}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`font-bold ${bal > 0 ? 'text-amber-700' : 'text-slate-500'}`}>{money(bal)}</div>
                          <div className="text-xs text-slate-400">balance</div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
      </div>
      <CustomerForm open={open} customer={null} onClose={() => setOpen(false)} />
    </div>
  );
}
