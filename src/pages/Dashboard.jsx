/** Dashboard: greeting, period KPIs with change, sales chart, top products, payment mix, alerts. */
import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon, Segmented, StatusBadge, EmptyState, Skeleton } from '../components/ui.jsx';
import { useInvoices, useProducts, useStock, useBalances, useExpiry } from '../db/hooks.js';
import { paymentStatus } from '../lib/calc.js';
import { money, moneyCompact, number, date, todayISO, addDaysISO } from '../lib/format.js';
import { PAYMENT_METHODS, useSettings } from '../lib/settings.js';
import { useT } from '../i18n/index.js';
import { useCloudAccount } from '../hooks/useCloudAccount.js';

const PERIODS = { today: 1, '7d': 7, '30d': 30 };

function Delta({ now, before }) {
  const t = useT();
  if (!before) return now ? <span className="text-xs text-faint">{t('new')}</span> : null;
  const pct = ((now - before) / before) * 100;
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
      <Icon name="trend" className={`h-3.5 w-3.5 ${up ? '' : '-scale-y-100'}`} />{up ? '+' : ''}{pct.toFixed(0)}%
    </span>
  );
}

/**
 * KPI card. On phones the card is half the screen wide, so the value is smaller and
 * large amounts use compact notation ($12.5K); the full value shows from `sm` up and on hover.
 */
function Kpi({ label, value, compact, sub, delta, to, icon }) {
  const body = (
    <div className="card h-full p-3.5 transition hover:-translate-y-0.5 hover:shadow-pop sm:p-4" title={typeof value === 'string' ? value : undefined}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-semibold text-muted">{label}</span>
        <span className="hidden rounded-lg bg-brand-500/10 p-1.5 text-accent sm:inline-flex"><Icon name={icon} className="h-4 w-4" /></span>
      </div>
      <div className="mt-1.5 text-xl font-bold leading-tight tabular-nums tracking-tight text-ink sm:mt-2 sm:text-2xl lg:text-[1.7rem]">
        <span className="sm:hidden">{compact ?? value}</span>
        <span className="hidden break-words sm:inline">{value}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted sm:text-xs">{delta}{sub}</div>
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

/** Single-series bar chart with hover tooltip and a table fallback. */
function SalesChart({ days }) {
  const t = useT();
  const [hover, setHover] = useState(null);
  const W = 640; const H = 200; const PAD = 8; const PAD_B = 22; const PAD_T = 26;
  const max = Math.max(1, ...days.map((d) => d.total));
  const slot = (W - PAD * 2) / days.length;
  const barW = Math.max(4, Math.min(26, slot * 0.6));
  const y = (v) => H - PAD_B - (v / max) * (H - PAD_B - PAD_T);
  const best = days.reduce((a, b) => (b.total > a.total ? b : a), days[0]);
  const labelEvery = Math.ceil(days.length / 8);
  return (
    <div className="relative" dir="ltr">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-52 w-full" role="img" aria-label={t('Sales chart')}>
        <line x1={PAD} x2={W - PAD} y1={H - PAD_B} y2={H - PAD_B} className="stroke-line" strokeWidth="1" />
        {days.map((d, i) => {
          const cx = PAD + slot * i + slot / 2;
          const top = y(d.total);
          const h = H - PAD_B - top;
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onTouchStart={() => setHover(i)}>
              <rect x={cx - slot / 2} y={PAD_T - 10} width={slot} height={H - PAD_T} fill="transparent" />
              {d.total > 0 && (
                <path className="fill-[#259781] dark:fill-[#2fa88d]" opacity={hover === null || hover === i ? 1 : 0.5}
                  d={`M${cx - barW / 2},${H - PAD_B} V${top + Math.min(4, h)} q0,-4 4,-4 H${cx + barW / 2 - 4} q4,0 4,4 V${H - PAD_B} Z`} />
              )}
              {i % labelEvery === 0 && <text x={cx} y={H - 6} textAnchor="middle" className="fill-faint" fontSize="11">{d.label}</text>}
              {d === best && d.total > 0 && hover === null && (
                <text x={cx} y={top - 6} textAnchor="middle" className="fill-muted" fontSize="11" fontWeight="600">{money(d.total)}</text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute top-0 rounded-xl bg-slate-900 px-3 py-2 text-xs text-white shadow-pop dark:bg-slate-700"
          style={{ left: `clamp(0px, calc(${((hover + 0.5) / days.length) * 100}% - 64px), calc(100% - 140px))` }}>
          <div className="font-semibold">{date(days[hover].day)}</div>
          <div>{money(days[hover].total)} · {t('{n} invoices', { n: days[hover].count })}</div>
        </div>
      )}
      <details className="mt-1 text-xs text-muted">
        <summary className="cursor-pointer">{t('View as table')}</summary>
        <table className="mt-2 w-full">
          <tbody>{days.map((d) => <tr key={d.day}><td className="py-0.5">{date(d.day)}</td><td className="text-end">{d.count}</td><td className="text-end">{money(d.total)}</td></tr>)}</tbody>
        </table>
      </details>
    </div>
  );
}

function BarList({ rows, empty }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-faint">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value));
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex justify-between gap-3 text-sm"><span className="truncate text-ink">{r.label}</span><span className="shrink-0 font-semibold tabular-nums text-ink">{money(r.value)}</span></div>
          <div className="h-2 rounded-full bg-subtle"><div className="h-2 rounded-full bg-[#259781] dark:bg-[#2fa88d]" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export default function Dashboard() {
  const t = useT();
  const navigate = useNavigate();
  const invoices = useInvoices();
  const products = useProducts();
  const stock = useStock();
  const expiry = useExpiry();
  const balances = useBalances();
  const settings = useSettings();
  const account = useCloudAccount();
  const [period, setPeriod] = useState('7d');

  const data = useMemo(() => {
    if (!invoices || !products) return null;
    const today = todayISO();
    const n = PERIODS[period];
    const from = addDaysISO(today, -(n - 1));
    const prevFrom = addDaysISO(from, -n);
    const issued = invoices.filter((i) => i.status === 'issued');
    const inRange = (i, a, b) => i.date >= a && i.date <= b;
    const cur = issued.filter((i) => inRange(i, from, today));
    const prev = issued.filter((i) => inRange(i, prevFrom, addDaysISO(from, -1)));
    const sum = (list) => list.reduce((s, i) => s + (i.totals?.grandTotal || 0), 0);

    const chartDays = period === 'today' ? 14 : n;
    const days = Array.from({ length: chartDays }, (_, k) => {
      const day = addDaysISO(today, k - chartDays + 1);
      const list = issued.filter((i) => i.date === day);
      return { day, label: String(Number(day.slice(8))), total: sum(list), count: list.length };
    });

    const byProduct = new Map();
    cur.forEach((inv) => inv.items.forEach((it, idx) => {
      byProduct.set(it.name, (byProduct.get(it.name) || 0) + (inv.totals?.lineTotals?.[idx] || 0));
    }));
    const byMethod = new Map();
    cur.forEach((inv) => {
      let left = inv.totals?.paid || 0; // tendered cash beyond the total is change, not revenue
      (inv.payments || []).forEach((p) => {
        const v = Math.min(left, Number(p.amount) || 0);
        left -= v;
        if (v > 0) byMethod.set(p.method, (byMethod.get(p.method) || 0) + v);
      });
      if ((inv.totals?.balance || 0) > 0) byMethod.set('credit', (byMethod.get('credit') || 0) + inv.totals.balance);
    });

    const soon = addDaysISO(today, settings.expiryWarningDays);
    const low = products.filter((p) => (stock.get(p.id) || 0) <= (p.reorderLevel || 0));
    const expOf = (p) => expiry.get(p.id) ?? p.expiryDate;
    const expiring = products.filter((p) => expOf(p) && expOf(p) <= soon && (stock.get(p.id) || 0) > 0)
      .map((p) => ({ ...p, expiryDate: expOf(p) }))
      .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
    const receivable = [...balances.values()].reduce((s, v) => s + Math.max(0, v), 0);
    const overdue = issued.filter((i) => paymentStatus(i) === 'overdue');
    const total = sum(cur);
    return {
      today, total, prevTotal: sum(prev), count: cur.length, prevCount: prev.length,
      avg: cur.length ? total / cur.length : 0, prevAvg: prev.length ? sum(prev) / prev.length : 0,
      days, low, expiring, receivable, overdue, recent: invoices.slice(0, 6),
      top: [...byProduct.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, value]) => ({ label, value })),
      mix: [...byMethod.entries()].sort((a, b) => b[1] - a[1]).map(([m, value]) => ({
        label: m === 'credit' ? t('On credit') : t(PAYMENT_METHODS.find((x) => x.id === m)?.label || m), value,
      })),
    };
  }, [invoices, products, stock, expiry, balances, settings.expiryWarningDays, period, t]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? t('Good morning') : hour < 18 ? t('Good afternoon') : t('Good evening');
  const who = account.user?.email ? account.user.email.split('@')[0] : '';

  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-64" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  const periodLabel = { today: t('today'), '7d': t('last 7 days'), '30d': t('last 30 days') }[period];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{date(data.today)}</p>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{greeting}{who ? `, ${who}` : ''}</h1>
        </div>
        <Segmented size="sm" value={period} onChange={setPeriod} options={[
          { value: 'today', label: t('Today') }, { value: '7d', label: t('7 days') }, { value: '30d', label: t('30 days') },
        ]} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 [&>*]:min-w-0">
        {[
          ['scan', t('New sale'), '/pos', 'from-brand-500 to-brand-700 text-white'],
          ['box', t('Add product'), '/products?new=1', 'bg-surface text-ink border border-line'],
          ['users', t('Add customer'), '/customers?new=1', 'bg-surface text-ink border border-line'],
          ['invoice', t('Invoices'), '/invoices', 'bg-surface text-ink border border-line'],
        ].map(([icon, label, to, cls], i) => (
          <button key={to} type="button" onClick={() => navigate(to)}
            className={`flex min-w-0 items-center gap-2 rounded-2xl px-3 py-2.5 text-[13px] font-semibold shadow-card transition active:scale-[.98] sm:gap-3 sm:px-4 sm:py-3 sm:text-sm ${i === 0 ? `bg-gradient-to-br ${cls}` : `${cls} hover:bg-subtle`}`}>
            <Icon name={icon} className="h-5 w-5 shrink-0" /><span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0">
        <Kpi icon="trend" label={t('Sales')} value={money(data.total)} compact={moneyCompact(data.total)} delta={<Delta now={data.total} before={data.prevTotal} />} sub={periodLabel} to="/invoices" />
        <Kpi icon="invoice" label={t('Invoices')} value={number(data.count)} delta={<Delta now={data.count} before={data.prevCount} />} sub={periodLabel} to="/invoices" />
        <Kpi icon="cart" label={t('Average sale')} value={money(data.avg)} compact={moneyCompact(data.avg)} delta={<Delta now={data.avg} before={data.prevAvg} />} sub={periodLabel} />
        <Kpi icon="wallet" label={t('Receivables')} value={money(data.receivable)} compact={moneyCompact(data.receivable)} sub={t('{n} overdue', { n: data.overdue.length })} to="/customers" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3 [&>*]:min-w-0">
        <div className="card min-w-0 p-4 lg:col-span-2">
          <h2 className="font-semibold text-ink">{t('Sales by day')}</h2>
          <SalesChart days={data.days} />
        </div>
        <div className="card p-4">
          <h2 className="mb-3 font-semibold text-ink">{t('Alerts')}</h2>
          {data.low.length === 0 && data.expiring.length === 0 ? (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
              <Icon name="checkCircle" className="h-5 w-5" />{t('Stock levels and expiry dates look good.')}
            </div>
          ) : (
            <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
              {data.low.slice(0, 8).map((p) => (
                <li key={`l${p.id}`} className="flex items-center justify-between gap-2 rounded-xl bg-amber-500/10 px-3 py-2">
                  <span className="flex min-w-0 items-center gap-2 text-ink"><Icon name="alert" className="h-4 w-4 shrink-0 text-amber-600" /><span className="truncate">{p.name}</span></span>
                  <span className="shrink-0 text-xs font-bold text-amber-700 dark:text-amber-300">{t('{n} left', { n: stock.get(p.id) || 0 })}</span>
                </li>
              ))}
              {data.expiring.slice(0, 8).map((p) => (
                <li key={`e${p.id}`} className="flex items-center justify-between gap-2 rounded-xl bg-rose-500/10 px-3 py-2">
                  <span className="flex min-w-0 items-center gap-2 text-ink"><Icon name="alert" className="h-4 w-4 shrink-0 text-rose-600" /><span className="truncate">{p.name}</span></span>
                  <span className="shrink-0 text-xs font-bold text-rose-700 dark:text-rose-300">{p.expiryDate < data.today ? t('Expired') : date(p.expiryDate)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3 [&>*]:min-w-0">
        <div className="card p-4">
          <h2 className="mb-3 font-semibold text-ink">{t('Top products')}</h2>
          <BarList rows={data.top} empty={t('No sales in this period yet.')} />
        </div>
        <div className="card p-4">
          <h2 className="mb-3 font-semibold text-ink">{t('Payment methods')}</h2>
          <BarList rows={data.mix} empty={t('No payments in this period yet.')} />
        </div>
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="font-semibold text-ink">{t('Recent invoices')}</h2>
            <Link to="/invoices" className="text-sm font-semibold text-accent">{t('View all')}</Link>
          </div>
          {data.recent.length === 0 ? <EmptyState icon="invoice" title={t('No sales yet')} text={t('Start from New Sale — try scanning a barcode.')} /> : (
            <ul className="divide-y divide-line">
              {data.recent.map((inv) => (
                <li key={inv.id}>
                  <Link to={`/invoices/${inv.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-subtle">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-semibold text-ink"><span dir="ltr">{inv.number}</span><StatusBadge status={paymentStatus(inv)} /></div>
                      <div className="truncate text-xs text-muted">{inv.customer?.name || t('Walk-in customer')} · {date(inv.date)}</div>
                    </div>
                    <div className="text-sm font-bold tabular-nums text-ink">{money(inv.totals?.grandTotal)}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
