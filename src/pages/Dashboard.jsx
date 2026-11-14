/** Dashboard: KPIs, 14-day sales chart, stock & expiry alerts, recent invoices. */
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, PageHeader, StatusBadge, EmptyState } from '../components/ui.jsx';
import { useInvoices, useProducts, useStock, useBalances } from '../db/hooks.js';
import { paymentStatus } from '../lib/calc.js';
import { money, date, todayISO, addDaysISO } from '../lib/format.js';
import { useSettings } from '../lib/settings.js';

function Stat({ label, value, sub, to }) {
  const body = (
    <div className="card h-full p-4 transition hover:shadow-md">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

/** Single-series bar chart (SVG) with hover tooltip and a table fallback. */
function SalesChart({ days }) {
  const [hover, setHover] = useState(null);
  const W = 640; const H = 200; const PAD_L = 8; const PAD_B = 22; const PAD_T = 26;
  const max = Math.max(1, ...days.map((d) => d.total));
  const slot = (W - PAD_L * 2) / days.length;
  const barW = Math.max(6, Math.min(26, slot * 0.55));
  const y = (v) => H - PAD_B - (v / max) * (H - PAD_B - PAD_T);
  const best = days.reduce((a, b) => (b.total > a.total ? b : a), days[0]);
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-52 w-full" role="img" aria-label="Sales over the last 14 days">
        <line x1={PAD_L} x2={W - PAD_L} y1={H - PAD_B} y2={H - PAD_B} stroke="#cbd5e1" strokeWidth="1" />
        {days.map((d, i) => {
          const cx = PAD_L + slot * i + slot / 2;
          const top = y(d.total);
          const h = H - PAD_B - top;
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onTouchStart={() => setHover(i)}>
              <rect x={cx - slot / 2} y={PAD_T - 10} width={slot} height={H - PAD_T} fill="transparent" />
              {d.total > 0 && (
                <path fill="#259781" opacity={hover === null || hover === i ? 1 : 0.55}
                  d={`M${cx - barW / 2},${H - PAD_B} V${top + Math.min(4, h)} q0,-4 4,-4 H${cx + barW / 2 - 4} q4,0 4,4 V${H - PAD_B} Z`} />
              )}
              {(i % 2 === 0 || days.length <= 7) && (
                <text x={cx} y={H - 6} textAnchor="middle" className="fill-slate-500" fontSize="11">{d.label}</text>
              )}
              {d === best && d.total > 0 && hover === null && (
                <text x={cx} y={top - 6} textAnchor="middle" className="fill-slate-700" fontSize="11" fontWeight="600">{money(d.total)}</text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute top-0 rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow"
          style={{ left: `clamp(0px, calc(${((hover + 0.5) / days.length) * 100}% - 60px), calc(100% - 130px))` }}>
          <div className="font-semibold">{date(days[hover].day)}</div>
          <div>{money(days[hover].total)} · {days[hover].count} invoices</div>
        </div>
      )}
      <details className="mt-1 text-xs text-slate-500">
        <summary className="cursor-pointer">View as table</summary>
        <table className="mt-2 w-full">
          <tbody>{days.map((d) => <tr key={d.day}><td className="py-0.5">{date(d.day)}</td><td className="text-right">{d.count}</td><td className="text-right">{money(d.total)}</td></tr>)}</tbody>
        </table>
      </details>
    </div>
  );
}

export default function Dashboard() {
  const invoices = useInvoices();
  const products = useProducts();
  const stock = useStock();
  const balances = useBalances();
  const settings = useSettings();

  const data = useMemo(() => {
    if (!invoices || !products) return null;
    const today = todayISO();
    const month = today.slice(0, 7);
    const issued = invoices.filter((i) => i.status === 'issued');
    const sum = (list) => list.reduce((s, i) => s + (i.totals?.grandTotal || 0), 0);
    const todays = issued.filter((i) => i.date === today);
    const monthly = issued.filter((i) => (i.date || '').startsWith(month));
    const days = Array.from({ length: 14 }, (_, k) => {
      const day = addDaysISO(today, k - 13);
      const list = issued.filter((i) => i.date === day);
      return { day, label: day.slice(8), total: sum(list), count: list.length };
    });
    const soon = addDaysISO(today, settings.expiryWarningDays);
    const low = products.filter((p) => (stock.get(p.id) || 0) <= (p.reorderLevel || 0));
    const expiring = products.filter((p) => p.expiryDate && p.expiryDate <= soon && (stock.get(p.id) || 0) > 0)
      .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
    const receivable = [...balances.values()].reduce((s, v) => s + Math.max(0, v), 0);
    const overdue = issued.filter((i) => paymentStatus(i) === 'overdue');
    return { todays, monthly, sumToday: sum(todays), sumMonth: sum(monthly), days, low, expiring, receivable, overdue, recent: invoices.slice(0, 8), today };
  }, [invoices, products, stock, balances, settings.expiryWarningDays]);

  if (!data) return <div className="p-8 text-center text-slate-500">Loading…</div>;

  return (
    <div>
      <PageHeader title={`Welcome to ${settings.company.name}`} subtitle={date(data.today)}
        actions={<Link to="/pos" className="btn-primary"><Icon name="scan" className="h-4 w-4" /> New sale</Link>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Today" value={money(data.sumToday)} sub={`${data.todays.length} invoices`} to="/invoices" />
        <Stat label="This month" value={money(data.sumMonth)} sub={`${data.monthly.length} invoices`} to="/invoices" />
        <Stat label="Receivables" value={money(data.receivable)} sub={`${data.overdue.length} overdue invoices`} to="/customers" />
        <Stat label="Low stock" value={data.low.length} sub={`${data.expiring.length} expiring ≤ ${settings.expiryWarningDays} days`} to="/products" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="card min-w-0 p-4 lg:col-span-2">
          <h2 className="font-semibold text-slate-900">Sales — last 14 days</h2>
          <SalesChart days={data.days} />
        </div>
        <div className="card p-4">
          <h2 className="mb-2 font-semibold text-slate-900">Alerts</h2>
          {data.low.length === 0 && data.expiring.length === 0 ? (
            <p className="text-sm text-slate-500">All stock levels and expiry dates look good.</p>
          ) : (
            <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
              {data.low.slice(0, 8).map((p) => (
                <li key={`l${p.id}`} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2"><Icon name="alert" className="h-4 w-4 shrink-0 text-amber-600" /><span className="truncate">{p.name}</span></span>
                  <span className="shrink-0 font-semibold text-amber-800">{stock.get(p.id) || 0} left</span>
                </li>
              ))}
              {data.expiring.slice(0, 8).map((p) => (
                <li key={`e${p.id}`} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2"><Icon name="alert" className="h-4 w-4 shrink-0 text-rose-600" /><span className="truncate">{p.name} ({p.batchNumber})</span></span>
                  <span className="shrink-0 font-semibold text-rose-700">{p.expiryDate < data.today ? 'Expired' : `Exp ${date(p.expiryDate)}`}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card mt-5 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold">Recent invoices</h2>
          <Link to="/invoices" className="text-sm font-semibold text-brand-700">View all</Link>
        </div>
        {data.recent.length === 0 ? <EmptyState icon="invoice" title="No sales yet" text="Start selling from the New Sale screen — try scanning a product barcode." /> : (
          <ul className="divide-y divide-slate-100">
            {data.recent.map((inv) => (
              <li key={inv.id}>
                <Link to={`/invoices/${inv.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-semibold">{inv.number}<StatusBadge status={paymentStatus(inv)} /></div>
                    <div className="truncate text-xs text-slate-500">{inv.customer?.name || 'Walk-in'} · {date(inv.date)}</div>
                  </div>
                  <div className="font-bold">{money(inv.totals?.grandTotal)}</div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
