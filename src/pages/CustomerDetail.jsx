/** Customer profile: contact details, balance, and full purchase history. */
import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon, StatusBadge, EmptyState, useToast } from '../components/ui.jsx';
import { CustomerForm } from './Customers.jsx';
import { useCustomer, useInvoices, useBalances } from '../db/hooks.js';
import { deleteCustomer } from '../db/repo.js';
import { paymentStatus } from '../lib/calc.js';
import { money, date } from '../lib/format.js';

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const customer = useCustomer(id);
  const invoices = useInvoices();
  const balances = useBalances();
  const [edit, setEdit] = useState(false);

  const history = useMemo(() => (invoices || []).filter((i) => i.customerId === id), [invoices, id]);
  const stats = useMemo(() => {
    const issued = history.filter((i) => i.status === 'issued');
    const products = new Map();
    issued.forEach((inv) => inv.items.forEach((it) => products.set(it.name, (products.get(it.name) || 0) + Number(it.qty))));
    return {
      lifetime: issued.reduce((s, i) => s + (i.totals?.grandTotal || 0), 0),
      count: issued.length,
      top: [...products.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    };
  }, [history]);

  if (customer === undefined) return <div className="p-8 text-center text-slate-500">Loading…</div>;
  if (!customer || customer.deleted) return <div className="p-8 text-center text-slate-500">Customer not found.</div>;

  const balance = balances.get(customer.id) || 0;
  const remove = async () => {
    if (!window.confirm(`Delete ${customer.name}? Their invoices are kept.`)) return;
    await deleteCustomer(customer.id);
    toast('Customer deleted');
    navigate('/customers', { replace: true });
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button type="button" className="btn-ghost px-2" onClick={() => navigate('/customers')} aria-label="Back"><Icon name="chevronLeft" /></button>
          <div>
            <h1 className="text-xl font-bold sm:text-2xl">{customer.name}</h1>
            <p className="text-sm text-slate-500">{customer.type}{customer.taxId ? ` · ${customer.taxId}` : ''}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={() => setEdit(true)}><Icon name="edit" className="h-4 w-4" /> Edit</button>
          <button type="button" className="btn-ghost text-rose-600" onClick={remove}><Icon name="trash" className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-4"><div className="label">Balance due</div><div className={`text-2xl font-bold ${balance > 0 ? 'text-amber-700' : ''}`}>{money(balance)}</div>
          {customer.creditLimit > 0 && <div className="text-xs text-slate-500">Credit limit {money(customer.creditLimit)}</div>}</div>
        <div className="card p-4"><div className="label">Lifetime sales</div><div className="text-2xl font-bold">{money(stats.lifetime)}</div><div className="text-xs text-slate-500">{stats.count} invoices</div></div>
        <div className="card p-4 text-sm text-slate-600">
          <div className="label">Contact</div>
          {customer.phone && <div><a className="text-brand-700" href={`tel:${customer.phone}`}>{customer.phone}</a></div>}
          {customer.email && <div><a className="text-brand-700" href={`mailto:${customer.email}`}>{customer.email}</a></div>}
          {customer.address && <div className="whitespace-pre-line">{customer.address}</div>}
        </div>
      </div>

      {stats.top.length > 0 && (
        <div className="card mt-4 p-4">
          <div className="label">Most purchased</div>
          <div className="mt-1 flex flex-wrap gap-2">
            {stats.top.map(([name, qty]) => <span key={name} className="badge bg-brand-50 text-brand-800">{name} × {qty}</span>)}
          </div>
        </div>
      )}

      <div className="mb-3 mt-6 flex items-center justify-between">
        <h2 className="font-semibold">Purchase history</h2>
        <Link to="/pos" className="btn-primary btn-sm"><Icon name="plus" className="h-4 w-4" /> New sale</Link>
      </div>
      <div className="card overflow-hidden">
        {history.length === 0 ? <EmptyState icon="invoice" title="No invoices yet" /> : (
          <ul className="divide-y divide-slate-100">
            {history.map((inv) => (
              <li key={inv.id}>
                <Link to={`/invoices/${inv.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-slate-50">
                  <div>
                    <div className="flex items-center gap-2 font-semibold">{inv.number} <StatusBadge status={paymentStatus(inv)} /></div>
                    <div className="text-xs text-slate-500">{date(inv.date)} · {inv.items.length} lines</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{money(inv.totals?.grandTotal)}</div>
                    {inv.status === 'issued' && inv.totals?.balance > 0 && <div className="text-xs text-amber-700">{money(inv.totals.balance)} due</div>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <CustomerForm open={edit} customer={customer} onClose={() => setEdit(false)} />
    </div>
  );
}
