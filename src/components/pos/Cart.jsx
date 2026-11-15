/** Cart lines with qty steppers; tap a line to edit price / discount / VAT. */
import React, { useState } from 'react';
import { Icon, Sheet, Field, EmptyState } from '../ui.jsx';
import { useT } from '../../i18n/index.js';
import { money } from '../../lib/format.js';

const numeric = (v) => v.replace(/[^0-9.]/g, '');

export function QtyStepper({ value, onChange, size = 'md' }) {
  const t = useT();
  const btn = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';
  return (
    <div className="inline-flex items-center rounded-xl border border-line bg-surface">
      <button type="button" className={`${btn} flex items-center justify-center rounded-s-xl text-muted hover:bg-subtle active:scale-90`} aria-label={t('Decrease quantity')}
        onClick={() => onChange(Math.max(0, Number(value) - 1))}><Icon name="minus" className="h-4 w-4" /></button>
      <input className="w-10 border-0 bg-transparent p-0 text-center text-sm font-bold text-ink focus:ring-0" inputMode="decimal"
        value={value} aria-label={t('Quantity')} onChange={(e) => onChange(numeric(e.target.value))} />
      <button type="button" className={`${btn} flex items-center justify-center rounded-e-xl text-muted hover:bg-subtle active:scale-90`} aria-label={t('Increase quantity')}
        onClick={() => onChange(Number(value) + 1)}><Icon name="plus" className="h-4 w-4" /></button>
    </div>
  );
}

function LineEditor({ line, onChange, onRemove, onClose }) {
  const t = useT();
  if (!line) return null;
  return (
    <Sheet open title={line.name} size="sm" onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn-ghost me-auto text-rose-600" onClick={() => { onRemove(line.key); onClose(); }}>
            <Icon name="trash" className="h-4 w-4" />{t('Remove')}
          </button>
          <button type="button" className="btn-primary" onClick={onClose}>{t('Done')}</button>
        </>
      )}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><span className="label">{t('Quantity')}</span><QtyStepper value={line.qty} onChange={(qty) => onChange(line.key, { qty })} /></div>
        <Field label={t('Unit price')}><input className="input" inputMode="decimal" value={line.price} onChange={(e) => onChange(line.key, { price: numeric(e.target.value) })} /></Field>
        <Field label={t('Discount %')}><input className="input" inputMode="decimal" value={line.discountPct} onChange={(e) => onChange(line.key, { discountPct: numeric(e.target.value) })} /></Field>
        <Field label={t('VAT %')}><input className="input" inputMode="decimal" value={line.taxRate} onChange={(e) => onChange(line.key, { taxRate: numeric(e.target.value) })} /></Field>
        <Field label={t('Batch')}><input className="input font-mono" value={line.batchNumber || ''} onChange={(e) => onChange(line.key, { batchNumber: e.target.value })} /></Field>
      </div>
    </Sheet>
  );
}

export default function Cart({ items, lineTotals, shortages, stock, onChange, onRemove }) {
  const t = useT();
  const [editing, setEditing] = useState(null);
  const line = items.find((i) => i.key === editing);

  if (items.length === 0) {
    return <EmptyState icon="cart" title={t('Cart is empty')} text={t('Tap a product or scan a barcode to start a sale.')} />;
  }
  return (
    <>
      <ul className="divide-y divide-line">
        {items.map((it, idx) => (
          <li key={it.key} className="flex items-center gap-3 py-3">
            <button type="button" className="min-w-0 flex-1 text-start" onClick={() => setEditing(it.key)}>
              <span className="block truncate text-sm font-semibold text-ink">{it.name}</span>
              <span className="block truncate text-xs text-muted">
                {money(it.price)}{Number(it.discountPct) ? ` · −${it.discountPct}%` : ''}{Number(it.taxRate) ? ` · ${t('VAT')} ${it.taxRate}%` : ''}
                {it.batchNumber ? ` · ${it.batchNumber}` : ''}
              </span>
              {shortages.has(it.productId) && (
                <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-rose-600">
                  <Icon name="alert" className="h-3.5 w-3.5" />{t('Only {n} in stock', { n: stock.get(it.productId) || 0 })}
                </span>
              )}
            </button>
            <QtyStepper size="sm" value={it.qty} onChange={(qty) => (Number(qty) === 0 && qty !== '' ? onRemove(it.key) : onChange(it.key, { qty }))} />
            <span className="w-20 text-end text-sm font-bold tabular-nums text-ink">{money(lineTotals[idx] ?? 0)}</span>
          </li>
        ))}
      </ul>
      <LineEditor line={line} onChange={onChange} onRemove={onRemove} onClose={() => setEditing(null)} />
    </>
  );
}
