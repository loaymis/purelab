/** Product catalogue: batches, expiry, pricing, VAT, barcodes and stock ledger. */
import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Icon, Sheet, Field, PageHeader, EmptyState, ListSkeleton, Fab, useToast, useConfirm,
} from '../components/ui.jsx';
import BarcodeScanner from '../components/BarcodeScanner.jsx';
import { useProducts, useStock, useMovements } from '../db/hooks.js';
import { saveProduct, deleteProduct, adjustStock } from '../db/repo.js';
import { CATEGORIES, useSettings } from '../lib/settings.js';
import { money, number, date, dateTime, addDaysISO, todayISO } from '../lib/format.js';
import { parseGS1 } from '../lib/barcode.js';
import { useT } from '../i18n/index.js';

const EMPTY = {
  name: '', brand: 'PureLab', sku: '', barcode: '', category: 'Dermo-cosmetic', batchNumber: '', expiryDate: '',
  price: '', cost: '', taxRate: '', reorderLevel: '', unit: 'pcs', description: '',
};

const REASONS = [
  { id: 'purchase', label: 'Stock received (purchase)', sign: 1 },
  { id: 'return', label: 'Customer return', sign: 1 },
  { id: 'adjustment', label: 'Count correction (+/−)', sign: 0 },
  { id: 'damaged', label: 'Damaged', sign: -1 },
  { id: 'expired', label: 'Expired / destroyed', sign: -1 },
  { id: 'sample', label: 'Free sample / promo', sign: -1 },
];
const REASON_LABELS = { opening: 'Opening stock', sale: 'Sale', ...Object.fromEntries(REASONS.map((r) => [r.id, r.label])) };

function ProductForm({ open, product, onClose }) {
  const t = useT();
  const toast = useToast();
  const settings = useSettings();
  const [form, setForm] = useState(EMPTY);
  const [opening, setOpening] = useState('');
  const [scan, setScan] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(product ? { ...EMPTY, ...product } : { ...EMPTY, taxRate: settings.defaultTaxRate, reorderLevel: settings.lowStockDefault });
    setOpening('');
    setScan(false);
  }, [open, product, settings.defaultTaxRate, settings.lowStockDefault]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const onScanned = (code) => {
    const gs1 = parseGS1(code);
    setForm((f) => ({
      ...f,
      barcode: gs1?.gtin ? gs1.gtin.replace(/^0/, '') : code,
      batchNumber: gs1?.batch || f.batchNumber,
      expiryDate: gs1?.expiry || f.expiryDate,
    }));
    setScan(false);
  };
  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    try {
      await saveProduct(form, { openingStock: product ? 0 : Number(opening) || 0 });
      toast(product ? t('Product updated') : t('Product created'));
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <Sheet open={open} title={product ? t('Edit product') : t('New product')} onClose={onClose} size="lg"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>{t('Cancel')}</button>
        <button type="submit" form="product-form" className="btn-primary">{t('Save')}</button></>}>
      <form id="product-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label={t('Product name')} className="sm:col-span-2"><input className="input" required value={form.name} onChange={set('name')} /></Field>
        <Field label={t('Brand')}><input className="input" value={form.brand} onChange={set('brand')} /></Field>
        <Field label={t('Category')}>
          <select className="input" value={form.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c} value={c}>{t(c)}</option>)}</select>
        </Field>
        <Field label={t('SKU')}><input className="input font-mono" dir="ltr" value={form.sku} onChange={set('sku')} /></Field>
        <Field label={t('Barcode (EAN / UPC / GTIN)')}>
          <div className="flex gap-2">
            <input className="input font-mono" dir="ltr" value={form.barcode} onChange={set('barcode')} />
            <button type="button" className="btn-secondary btn-icon" onClick={() => setScan((s) => !s)} aria-label={t('Scan barcode')}><Icon name="scan" /></button>
          </div>
        </Field>
        {scan && <div className="sm:col-span-2"><BarcodeScanner continuous={false} onDetected={onScanned} /></div>}
        <Field label={t('Batch / Lot number')}><input className="input font-mono" dir="ltr" value={form.batchNumber} onChange={set('batchNumber')} /></Field>
        <Field label={t('Expiry date')}><input type="date" className="input" value={form.expiryDate} onChange={set('expiryDate')} /></Field>
        <Field label={`${t('Selling price')} (${settings.currency})`}><input className="input" inputMode="decimal" required value={form.price} onChange={set('price')} /></Field>
        <Field label={`${t('Cost price')} (${settings.currency})`}><input className="input" inputMode="decimal" value={form.cost} onChange={set('cost')} /></Field>
        <Field label={t('VAT %')}><input className="input" inputMode="decimal" value={form.taxRate} onChange={set('taxRate')} /></Field>
        <Field label={t('Reorder level')}><input className="input" inputMode="numeric" value={form.reorderLevel} onChange={set('reorderLevel')} /></Field>
        {!product && (
          <Field label={t('Opening stock')} hint={t('Quantity on hand now (recorded in the stock ledger).')}>
            <input className="input" inputMode="numeric" value={opening} onChange={(e) => setOpening(e.target.value.replace(/[^0-9-]/g, ''))} />
          </Field>
        )}
        <Field label={t('Unit')}><input className="input" value={form.unit} onChange={set('unit')} /></Field>
        <Field label={t('Description / usage notes')} className="sm:col-span-2">
          <textarea className="input" rows={2} value={form.description} onChange={set('description')} />
        </Field>
      </form>
    </Sheet>
  );
}

function StockSheet({ product, stock, onClose }) {
  const t = useT();
  const toast = useToast();
  const movements = useMovements(product?.id);
  const [reason, setReason] = useState('purchase');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => { setReason('purchase'); setQty(''); setNote(''); }, [product]);
  if (!product) return null;

  const r = REASONS.find((x) => x.id === reason);
  const submit = async (e) => {
    e.preventDefault();
    let n = Number(qty);
    if (!n) return;
    if (r.sign === 1) n = Math.abs(n);
    if (r.sign === -1) n = -Math.abs(n);
    await adjustStock(product.id, n, reason, note);
    toast(t('Stock {n} recorded', { n: `${n > 0 ? '+' : ''}${n}` }));
    setQty('');
    setNote('');
  };

  return (
    <Sheet open title={product.name} onClose={onClose} size="lg">
      <div className="mb-4 flex items-center justify-between rounded-2xl bg-brand-500/10 px-4 py-3">
        <span className="text-sm text-accent">{t('On hand')}</span>
        <span className="text-2xl font-bold tabular-nums text-ink">{number(stock)} {product.unit}</span>
      </div>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_120px]">
        <Field label={t('Movement')}>
          <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
            {REASONS.map((x) => <option key={x.id} value={x.id}>{t(x.label)}</option>)}
          </select>
        </Field>
        <Field label={r.sign === 0 ? t('Qty (+/−)') : t('Quantity')}>
          <input className="input" inputMode="numeric" required value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9-]/g, ''))} />
        </Field>
        <Field label={t('Note (supplier invoice, batch…)')} className="sm:col-span-2"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="sm:col-span-2"><button type="submit" className="btn-primary w-full sm:w-auto">{t('Record movement')}</button></div>
      </form>
      <h3 className="mb-2 mt-6 text-sm font-semibold text-ink">{t('Stock ledger')}</h3>
      <ul className="divide-y divide-line rounded-2xl border border-line text-sm">
        {movements.length === 0 && <li className="p-3 text-muted">{t('No movements yet.')}</li>}
        {movements.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0">
              <div className="font-medium text-ink">{t(REASON_LABELS[m.reason] || m.reason)}{m.note ? <span className="font-normal text-muted"> · {m.note}</span> : null}</div>
              <div className="text-xs text-faint">{dateTime(m.created_at)}</div>
            </div>
            <span className={`font-mono font-semibold ${m.qty < 0 ? 'text-rose-600' : 'text-emerald-600'}`} dir="ltr">{m.qty > 0 ? '+' : ''}{m.qty}</span>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

export default function Products() {
  const t = useT();
  const products = useProducts();
  const stock = useStock();
  const settings = useSettings();
  const toast = useToast();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [view, setView] = useState('all');
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [stockFor, setStockFor] = useState(null);

  useEffect(() => {
    if (params.get('new')) { setEditing(null); setFormOpen(true); setParams({}, { replace: true }); }
  }, [params, setParams]);

  const soon = addDaysISO(todayISO(), settings.expiryWarningDays);
  const today = todayISO();
  const rows = useMemo(() => {
    if (!products) return [];
    const needle = q.trim().toLowerCase();
    return products.filter((p) => {
      if (cat !== 'All' && p.category !== cat) return false;
      const s = stock.get(p.id) || 0;
      if (view === 'low' && s > (p.reorderLevel || 0)) return false;
      if (view === 'expiring' && !(p.expiryDate && p.expiryDate <= soon)) return false;
      return !needle || [p.name, p.sku, p.barcode, p.batchNumber, p.brand].some((v) => String(v || '').toLowerCase().includes(needle));
    });
  }, [products, q, cat, view, stock, soon]);
  const stockValue = useMemo(() => (products || []).reduce((s, p) => s + Math.max(0, stock.get(p.id) || 0) * (Number(p.cost) || 0), 0), [products, stock]);

  const openNew = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (p) => { setEditing(p); setFormOpen(true); };
  const remove = async (p) => {
    if (!(await confirm({ title: t('Delete product'), message: t('Delete {name}? Existing invoices are not affected.', { name: p.name }), danger: true, confirmLabel: t('Delete') }))) return;
    await deleteProduct(p.id);
    toast(t('Product deleted'));
  };

  const stockBadge = (p) => {
    const s = stock.get(p.id) || 0;
    const tone = s <= 0 ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
      : s <= (p.reorderLevel || 0) ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300';
    return <span className={`badge tabular-nums ${tone}`}>{number(s)}</span>;
  };
  const expiryText = (p) => {
    if (!p.expiryDate) return <span className="text-faint">—</span>;
    const cls = p.expiryDate < today ? 'font-semibold text-rose-600' : p.expiryDate <= soon ? 'font-semibold text-amber-600' : 'text-muted';
    return <span className={cls}>{date(p.expiryDate)}</span>;
  };

  return (
    <div>
      <PageHeader title={t('Products')} subtitle={products ? t('{n} products · stock value {amount}', { n: products.length, amount: money(stockValue) }) : ''}
        actions={<button type="button" className="btn-primary hidden lg:inline-flex" onClick={openNew}><Icon name="plus" className="h-4 w-4" />{t('Add product')}</button>} />

      <div className="sticky top-[57px] z-10 -mx-4 mb-4 space-y-3 bg-canvas/95 px-4 py-2 backdrop-blur-lg lg:top-0 lg:mx-0 lg:px-0">
        <div className="relative">
          <Icon name="search" className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input className="input ps-9" placeholder={t('Search name, SKU, barcode, batch…')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
          {[['all', 'All stock'], ['low', 'Low / out of stock'], ['expiring', 'Expiring soon']].map(([id, label]) => (
            <button key={id} type="button" onClick={() => setView(id)} className={`chip ${view === id ? 'chip-active' : ''}`}>{t(label)}</button>
          ))}
          <span className="mx-1 w-px shrink-0 bg-line" />
          {['All', ...CATEGORIES].map((c) => (
            <button key={c} type="button" onClick={() => setCat(c)} className={`chip ${cat === c ? 'chip-active' : ''}`}>{t(c)}</button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        {products === undefined ? <ListSkeleton />
          : rows.length === 0 ? (
            <EmptyState title={products.length ? t('No matching products') : t('No products yet')}
              text={products.length ? t('Try another search or filter.') : t('Add your catalogue, or load demo data from Settings → Data.')}
              action={!products.length && <button type="button" className="btn-primary" onClick={openNew}>{t('Add product')}</button>} />
          ) : (
            <>
              <table className="hidden w-full lg:table">
                <thead className="border-b border-line bg-subtle/60">
                  <tr>
                    <th className="table-th">{t('Product')}</th><th className="table-th">{t('SKU / Barcode')}</th><th className="table-th">{t('Batch')}</th>
                    <th className="table-th">{t('Expiry')}</th><th className="table-th text-end">{t('Price')}</th><th className="table-th text-end">{t('Stock')}</th><th className="table-th" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((p) => (
                    <tr key={p.id} className="transition hover:bg-subtle">
                      <td className="table-td"><div className="font-semibold">{p.name}</div><div className="text-xs text-muted">{p.brand} · {t(p.category)}</div></td>
                      <td className="table-td font-mono text-xs" dir="ltr">{p.sku}<div className="text-muted">{p.barcode}</div></td>
                      <td className="table-td font-mono text-xs" dir="ltr">{p.batchNumber || '—'}</td>
                      <td className="table-td">{expiryText(p)}</td>
                      <td className="table-td text-end tabular-nums">{money(p.price)}{Number(p.taxRate) ? <div className="text-xs text-muted">+{p.taxRate}% {t('VAT')}</div> : null}</td>
                      <td className="table-td text-end">{stockBadge(p)}</td>
                      <td className="table-td whitespace-nowrap text-end">
                        <button type="button" className="btn-ghost btn-sm" onClick={() => setStockFor(p)}>{t('Stock')}</button>
                        <button type="button" className="btn-ghost btn-sm" onClick={() => openEdit(p)} aria-label={t('Edit')}><Icon name="edit" className="h-4 w-4" /></button>
                        <button type="button" className="btn-ghost btn-sm text-rose-600" onClick={() => remove(p)} aria-label={t('Delete')}><Icon name="trash" className="h-4 w-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="divide-y divide-line lg:hidden">
                {rows.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 p-4">
                    <button type="button" className="min-w-0 flex-1 text-start" onClick={() => openEdit(p)}>
                      <div className="font-semibold text-ink">{p.name}</div>
                      <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted">
                        <span dir="ltr">{p.sku}</span>{p.batchNumber && <span>· {p.batchNumber}</span>}<span>· {expiryText(p)}</span>
                      </div>
                    </button>
                    <button type="button" className="text-end" onClick={() => setStockFor(p)}>
                      <div className="font-bold tabular-nums text-ink">{money(p.price)}</div>
                      {stockBadge(p)}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
      </div>

      <Fab label={t('Add product')} onClick={openNew} />
      <ProductForm open={formOpen} product={editing} onClose={() => setFormOpen(false)} />
      {stockFor && <StockSheet product={stockFor} stock={stock.get(stockFor.id) || 0} onClose={() => setStockFor(null)} />}
    </div>
  );
}
