import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon, PageHeader, EmptyState, StatusBadge } from '../components/ui.jsx';
import { useInvoices } from '../db/hooks.js';
import { paymentStatus } from '../lib/calc.js';
import { money, date } from '../lib/format.js';

const FILTERS = ['all', 'unpaid', 'partial', 'overdue', 'paid', 'draft', 'void'];

export default function Invoices() {
  const invoices = useInvoices();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');

  const rows = useMemo(() => {
    if (!invoices) return [];
    const needle = q.trim().toLowerCase();
    return invoices
      .map((inv) => ({ ...inv, _status: paymentStatus(inv) }))
      .filter((inv) => filter === 'all' || inv._status === filter)
      .filter((inv) => !needle || [inv.number, inv.customer?.name, inv.customer?.phone, ...(inv.items || []).map((i) => i.name)]
        .some((v) => String(v || '').toLowerCase().includes(needle)));
  }, [invoices, q, filter]);

  return (
    <div>
      <PageHeader title="Invoices" subtitle={invoices ? `${invoices.length} total` : ''}
        actions={<Link to="/pos" className="btn-primary"><Icon name="plus" className="h-4 w-4" /> New sale</Link>} />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search number, customer, product…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {FILTERS.map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${filter === f ? 'bg-brand-700 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        {invoices === undefined ? <div className="p-8 text-center text-slate-500">Loading…</div>
          : rows.length === 0 ? <EmptyState icon="invoice" title="No invoices found" text="Create your first sale from the New Sale screen." />
            : (
              <>
                {/* Desktop table */}
                <table className="hidden w-full md:table">
                  <thead className="border-b border-slate-200 bg-slate-50">
                    <tr>
                      <th className="table-th">Number</th><th className="table-th">Date</th><th className="table-th">Customer</th>
                      <th className="table-th">Status</th><th className="table-th text-right">Total</th><th className="table-th text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((inv) => (
                      <tr key={inv.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/invoices/${inv.id}`)}>
                        <td className="table-td font-semibold text-slate-900">{inv.number}</td>
                        <td className="table-td">{date(inv.date)}</td>
                        <td className="table-td">{inv.customer?.name || 'Walk-in'}</td>
                        <td className="table-td"><StatusBadge status={inv._status} /></td>
                        <td className="table-td text-right font-medium">{money(inv.totals?.grandTotal)}</td>
                        <td className="table-td text-right">{inv.status === 'issued' && inv.totals?.balance > 0 ? money(inv.totals.balance) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* Mobile cards */}
                <ul className="divide-y divide-slate-100 md:hidden">
                  {rows.map((inv) => (
                    <li key={inv.id}>
                      <Link to={`/invoices/${inv.id}`} className="flex items-center justify-between gap-3 p-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2"><span className="font-semibold">{inv.number}</span><StatusBadge status={inv._status} /></div>
                          <div className="truncate text-sm text-slate-500">{inv.customer?.name || 'Walk-in'} · {date(inv.date)}</div>
                        </div>
                        <div className="text-right font-bold">{money(inv.totals?.grandTotal)}</div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
      </div>
    </div>
  );
}
