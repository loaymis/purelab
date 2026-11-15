/** Customer profile: contact, balance, quick WhatsApp/call, purchase history. */
import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Icon, StatusBadge, EmptyState, Avatar, Skeleton, useToast, useConfirm,
} from '../components/ui.jsx';
import { CustomerForm } from './Customers.jsx';
import { useCustomer, useInvoices, useBalances } from '../db/hooks.js';
import { deleteCustomer } from '../db/repo.js';
import { paymentStatus } from '../lib/calc.js';
import { money, date } from '../lib/format.js';
import { whatsappNumber } from '../lib/share.js';
import { useT } from '../i18n/index.js';

export default function CustomerDetail() {
  const t = useT();
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
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
      top: [...products.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
    };
  }, [history]);

  if (customer === undefined) return <div className="space-y-4"><Skeleton className="h-16 w-72" /><Skeleton className="h-32 rounded-2xl" /></div>;
  if (!customer || customer.deleted) return <div className="p-8 text-center text-muted">{t('Customer not found.')}</div>;

  const balance = balances.get(customer.id) || 0;
  const remove = async () => {
    if (!(await confirm({ title: t('Delete customer'), message: t('Delete {name}? Their invoices are kept.', { name: customer.name }), danger: true, confirmLabel: t('Delete') }))) return;
    await deleteCustomer(customer.id);
    toast(t('Customer deleted'));
    navigate('/customers', { replace: true });
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" className="btn-icon -ms-2 rounded-full text-muted" onClick={() => navigate('/customers')} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
          <Avatar name={customer.name} size="h-12 w-12 text-base" />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight text-ink sm:text-2xl">{customer.name}</h1>
            <p className="text-sm text-muted">{t(customer.type)}{customer.taxId ? ` · ${customer.taxId}` : ''}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {customer.phone && (
            <>
              <a className="btn-secondary btn-icon" href={`https://wa.me/${whatsappNumber(customer.phone)}`} target="_blank" rel="noreferrer" aria-label="WhatsApp"><Icon name="whatsapp" className="text-emerald-600" /></a>
              <a className="btn-secondary btn-icon" href={`tel:${customer.phone}`} aria-label={t('Call')}><Icon name="phone" /></a>
            </>
          )}
          <button type="button" className="btn-secondary" onClick={() => setEdit(true)}><Icon name="edit" className="h-4 w-4" />{t('Edit')}</button>
          <button type="button" className="btn-ghost btn-icon text-rose-600" onClick={remove} aria-label={t('Delete')}><Icon name="trash" className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className={`card p-4 ${balance > 0 ? 'border-amber-500/40 bg-amber-500/5' : ''}`}>
          <div className="text-xs font-semibold text-muted">{t('Balance due')}</div>
          <div className={`mt-1 text-2xl font-bold tabular-nums ${balance > 0 ? 'text-amber-600' : 'text-ink'}`}>{money(balance)}</div>
          {customer.creditLimit > 0 && <div className="text-xs text-muted">{t('Credit limit {amount}', { amount: money(customer.creditLimit) })}</div>}
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold text-muted">{t('Lifetime sales')}</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-ink">{money(stats.lifetime)}</div>
          <div className="text-xs text-muted">{t('{n} invoices', { n: stats.count })}</div>
        </div>
        <div className="card space-y-1 p-4 text-sm text-muted">
          <div className="text-xs font-semibold">{t('Contact')}</div>
          {customer.phone && <div dir="ltr" className="text-start">{customer.phone}</div>}
          {customer.email && <div><a className="text-accent" href={`mailto:${customer.email}`}>{customer.email}</a></div>}
          {customer.address && <div className="whitespace-pre-line">{customer.address}</div>}
          {!customer.phone && !customer.email && !customer.address && <div className="text-faint">—</div>}
        </div>
      </div>

      {stats.top.length > 0 && (
        <div className="card mt-4 p-4">
          <div className="text-xs font-semibold text-muted">{t('Most purchased')}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {stats.top.map(([name, qty]) => <span key={name} className="badge bg-brand-500/10 px-3 py-1 text-accent">{name} × {qty}</span>)}
          </div>
        </div>
      )}

      <div className="mb-3 mt-6 flex items-center justify-between">
        <h2 className="font-semibold text-ink">{t('Purchase history')}</h2>
        <Link to="/pos" className="btn-primary btn-sm"><Icon name="plus" className="h-4 w-4" />{t('New sale')}</Link>
      </div>
      <div className="card overflow-hidden">
        {history.length === 0 ? <EmptyState icon="invoice" title={t('No invoices yet')} /> : (
          <ul className="divide-y divide-line">
            {history.map((inv) => (
              <li key={inv.id}>
                <Link to={`/invoices/${inv.id}`} className="flex items-center justify-between gap-3 p-4 transition hover:bg-subtle">
                  <div>
                    <div className="flex items-center gap-2 font-semibold text-ink"><span dir="ltr">{inv.number}</span><StatusBadge status={paymentStatus(inv)} /></div>
                    <div className="text-xs text-muted">{date(inv.date)} · {t('{n} lines', { n: inv.items.length })}</div>
                  </div>
                  <div className="text-end">
                    <div className="font-bold tabular-nums text-ink">{money(inv.totals?.grandTotal)}</div>
                    {inv.status === 'issued' && inv.totals?.balance > 0 && <div className="text-xs font-semibold text-amber-600">{t('{amount} due', { amount: money(inv.totals.balance) })}</div>}
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
