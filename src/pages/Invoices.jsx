import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon, PageHeader, EmptyState, StatusBadge, ListSkeleton, Fab, useConfirm, useToast } from '../components/ui.jsx';
import { useInvoices } from '../db/hooks.js';
import { deleteVoidedInvoices } from '../db/repo.js';
import { paymentStatus } from '../lib/calc.js';
import { money, date } from '../lib/format.js';
import { useT } from '../i18n/index.js';

const FILTERS = [
  ['all', 'All'], ['unpaid', 'Unpaid'], ['partial', 'Partial'], ['overdue', 'Overdue'],
  ['paid', 'Paid'], ['draft', 'Draft'], ['void', 'Void'],
];

export default function Invoices() {
  const t = useT();
  const invoices = useInvoices();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const confirm = useConfirm();
  const toast = useToast();

  const withStatus = useMemo(() => (invoices || []).map((inv) => ({ ...inv, _status: paymentStatus(inv) })), [invoices]);
  const counts = useMemo(() => withStatus.reduce((m, i) => ({ ...m, [i._status]: (m[i._status] || 0) + 1 }), {}), [withStatus]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return withStatus
      .filter((inv) => filter === 'all' || inv._status === filter)
      .filter((inv) => !needle || [inv.number, inv.customer?.name, inv.customer?.phone, ...(inv.items || []).map((i) => i.name)]
        .some((v) => String(v || '').toLowerCase().includes(needle)));
  }, [withStatus, q, filter]);
  const deleteAllVoid = async () => {
    if (!(await confirm({ title: t('Delete voided invoices'), message: t('Delete all {n} voided invoices? This can’t be undone.', { n: counts.void }), danger: true, confirmLabel: t('Delete') }))) return;
    const n = await deleteVoidedInvoices();
    toast(t('{n} voided invoices deleted', { n }));
    setFilter('all');
  };
  const shownTotal = rows.filter((r) => r.status === 'issued').reduce((s, r) => s + (r.totals?.grandTotal || 0), 0);

  return (
    <div>
      <PageHeader title={t('Invoices')} subtitle={invoices ? t('{n} invoices · {amount}', { n: rows.length, amount: money(shownTotal) }) : ''}
        actions={<Link to="/pos" className="btn-primary hidden lg:inline-flex"><Icon name="plus" className="h-4 w-4" />{t('New sale')}</Link>} />

      <div className="sticky top-[57px] z-10 -mx-4 mb-4 space-y-3 bg-canvas/95 px-4 py-2 backdrop-blur-lg lg:top-0 lg:mx-0 lg:px-0">
        <div className="relative">
          <Icon name="search" className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input className="input ps-9" placeholder={t('Search number, customer, product…')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
          {FILTERS.map(([id, label]) => (
            <button key={id} type="button" onClick={() => setFilter(id)} className={`chip ${filter === id ? 'chip-active' : ''}`}>
              {t(label)}{id !== 'all' && counts[id] ? <span className="opacity-70">{counts[id]}</span> : null}
            </button>
          ))}
        </div>
        {filter === 'void' && counts.void > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-rose-500/10 px-4 py-2.5 text-sm">
            <span className="text-ink">{t('Voided invoices no longer count in sales or stock.')}</span>
            <button type="button" className="btn-danger btn-sm shrink-0" onClick={deleteAllVoid}>
              <Icon name="trash" className="h-4 w-4" />{t('Delete all voided ({n})', { n: counts.void })}
            </button>
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        {invoices === undefined ? <ListSkeleton />
          : rows.length === 0 ? (
            <EmptyState icon="invoice" title={invoices.length ? t('No invoices match') : t('No invoices yet')}
              text={invoices.length ? t('Try another search or filter.') : t('Your sales will appear here.')}
              action={!invoices.length && <Link to="/pos" className="btn-primary">{t('Make your first sale')}</Link>} />
          ) : (
            <>
              <table className="hidden w-full md:table">
                <thead className="border-b border-line bg-subtle/60">
                  <tr>
                    <th className="table-th">{t('Number')}</th><th className="table-th">{t('Date')}</th><th className="table-th">{t('Customer')}</th>
                    <th className="table-th">{t('Status')}</th><th className="table-th text-end">{t('Total')}</th><th className="table-th text-end">{t('Balance')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((inv) => (
                    <tr key={inv.id} className="cursor-pointer transition hover:bg-subtle" onClick={() => navigate(`/invoices/${inv.id}`)}>
                      <td className="table-td font-semibold" dir="ltr">{inv.number}</td>
                      <td className="table-td text-muted">{date(inv.date)}</td>
                      <td className="table-td">{inv.customer?.name || <span className="text-muted">{t('Walk-in customer')}</span>}</td>
                      <td className="table-td"><StatusBadge status={inv._status} /></td>
                      <td className="table-td text-end font-semibold tabular-nums">{money(inv.totals?.grandTotal)}</td>
                      <td className="table-td text-end tabular-nums">{inv.status === 'issued' && inv.totals?.balance > 0 ? <span className="font-semibold text-amber-600">{money(inv.totals.balance)}</span> : <span className="text-faint">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="divide-y divide-line md:hidden">
                {rows.map((inv) => (
                  <li key={inv.id}>
                    <Link to={`/invoices/${inv.id}`} className="flex items-center justify-between gap-3 p-4 active:bg-subtle">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2"><span className="font-semibold text-ink" dir="ltr">{inv.number}</span><StatusBadge status={inv._status} /></div>
                        <div className="truncate text-sm text-muted">{inv.customer?.name || t('Walk-in customer')} · {date(inv.date)}</div>
                      </div>
                      <div className="text-end">
                        <div className="font-bold tabular-nums text-ink">{money(inv.totals?.grandTotal)}</div>
                        {inv.status === 'issued' && inv.totals?.balance > 0 && <div className="text-xs font-semibold text-amber-600">{t('{amount} due', { amount: money(inv.totals.balance) })}</div>}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
      </div>
      <Fab label={t('New sale')} icon="scan" onClick={() => navigate('/pos')} />
    </div>
  );
}
