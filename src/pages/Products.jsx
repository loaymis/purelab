/**
 * Products: simple catalogue + stock.
 *  - Add product: name, barcode, expiry, prices, quantity. If the barcode already exists,
 *    the form becomes a "Restock" card (new expiry + quantity received).
 *  - Edit product: includes "Stock on hand" (saved as a count correction in the ledger).
 *  - Stock sheet: set exact count, receive / write off stock, lots by expiry, ledger.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Icon, Sheet, Field, PageHeader, EmptyState, ListSkeleton, Fab, Segmented, useToast, useConfirm,
} from '../components/ui.jsx';
import BarcodeScanner from '../components/BarcodeScanner.jsx';
import { useProducts, useStock, useMovements, useExpiry } from '../db/hooks.js';
import {
  saveProduct, deleteProduct, adjustStock, receiveStock, findProductByCode,
} from '../db/repo.js';
import { CATEGORIES, useSettings } from '../lib/settings.js';
import { money, number, date, dateTime, addDaysISO, todayISO } from '../lib/format.js';
import { parseGS1, candidateCodes } from '../lib/barcode.js';
import { lotsFor, correctionFor } from '../lib/stock.js';
import { useT } from '../i18n/index.js';

const EMPTY = {
  name: '', brand: 'PureLab', barcode: '', category: 'Dermo-cosmetic', expiryDate: '',
  price: '', cost: '', unit: 'pcs', description: '',
};
const numeric = (v) => String(v).replace(/[^0-9.]/g, '');
const integer = (v) => String(v).replace(/[^0-9]/g, '');

const OUT_REASONS = [
  { id: 'damaged', label: 'Damaged' },
  { id: 'expired', label: 'Expired / destroyed' },
  { id: 'sample', label: 'Free sample / promo' },
  { id: 'return', label: 'Customer return', sign: 1 },
];
const REASON_LABELS = {
  opening: 'Opening stock', sale: 'Sale', purchase: 'Stock received (purchase)', adjustment: 'Count correction (+/−)',
  return: 'Customer return', damaged: 'Damaged', expired: 'Expired / destroyed', sample: 'Free sample / promo',
};

/** Restock an existing product found by barcode: only new expiry + quantity. */
function RestockCard({ product, stock, expiry, form, setForm }) {
  const t = useT();
  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-start gap-3 rounded-2xl border border-brand-500/40 bg-brand-500/10 p-4">
        <span className="rounded-xl bg-brand-600 p-2 text-white"><Icon name="box" /></span>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-accent">{t('This barcode already exists')}</div>
          <div className="text-lg font-bold leading-tight text-ink">{product.name}</div>
          <div className="mt-1 text-sm text-muted">
            {t('In stock: {n}', { n: number(stock) })}{expiry ? ` · ${t('Expiry')} ${date(expiry)}` : ''} · {money(product.price)}
          </div>
        </div>
      </div>
      <p className="text-sm text-muted">{t('Add the new delivery — only the new expiry date and quantity are needed.')}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('New expiry date')}>
          <input type="date" className="input" required value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
        </Field>
        <Field label={t('Quantity received')}>
          <input className="input text-lg font-bold" inputMode="numeric" required data-autofocus value={form.qty}
            onChange={(e) => setForm({ ...form, qty: integer(e.target.value) })} />
        </Field>
      </div>
    </div>
  );
}

function ProductForm({ open, product, onClose, stockMap, expiry }) {
  const t = useT();
  const toast = useToast();
  const settings = useSettings();
  const [form, setForm] = useState(EMPTY);
  const [qty, setQty] = useState('');
  const [scan, setScan] = useState(false);
  const [existing, setExisting] = useState(null); // product already using this barcode
  const [restock, setRestock] = useState({ expiryDate: '', qty: '' });
  const currentStock = product ? stockMap.get(product.id) || 0 : 0;

  useEffect(() => {
    if (!open) return;
    setForm(product ? { ...EMPTY, ...product } : EMPTY);
    setQty(product ? String(currentStock) : '');
    setScan(false);
    setExisting(null);
    setRestock({ expiryDate: '', qty: '' });
  }, [open, product]); // eslint-disable-line react-hooks/exhaustive-deps

  // Look the barcode up as it is typed / scanned.
  useEffect(() => {
    if (!open) return undefined;
    const code = form.barcode.trim();
    if (code.length < 4) { setExisting(null); return undefined; }
    let alive = true;
    const id = setTimeout(async () => {
      const found = await findProductByCode(candidateCodes(code));
      if (alive) setExisting(found && found.id !== product?.id ? found : null);
    }, 250);
    return () => { alive = false; clearTimeout(id); };
  }, [form.barcode, open, product]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const onScanned = (code) => {
    const gs1 = parseGS1(code);
    setForm((f) => ({ ...f, barcode: gs1?.gtin ? gs1.gtin.replace(/^0/, '') : code, expiryDate: gs1?.expiry || f.expiryDate }));
    if (gs1?.expiry) setRestock((r) => ({ ...r, expiryDate: gs1.expiry }));
    setScan(false);
  };

  const restockMode = !product && existing;

  const submit = async (e) => {
    e.preventDefault();
    try {
      if (restockMode) {
        await receiveStock(existing.id, restock.qty, restock.expiryDate);
        toast(t('Added {n} to {name}', { n: restock.qty, name: existing.name }));
        onClose();
        return;
      }
      if (!form.name.trim()) return;
      if (product && existing) { toast(t('This barcode is already used by {name}', { name: existing.name }), 'error'); return; }
      const base = product
        ? form
        : { ...form, sku: form.barcode.trim(), taxRate: settings.defaultTaxRate, reorderLevel: settings.lowStockDefault };
      const saved = await saveProduct(base, { openingStock: product ? 0 : Number(qty) || 0 });
      if (product) {
        const diff = correctionFor(currentStock, qty === '' ? currentStock : qty);
        if (diff) await adjustStock(saved.id, diff, 'adjustment', t('Edited in product form'));
      }
      toast(product ? t('Product updated') : t('Product created'));
      onClose();
    } catch (err) {
      toast(t(err.message), 'error');
    }
  };

  return (
    <Sheet open={open} title={product ? t('Edit product') : restockMode ? t('Restock') : t('New product')} onClose={onClose} size="lg"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>{t('Cancel')}</button>
        <button type="submit" form="product-form" className="btn-primary">{restockMode ? t('Add stock') : t('Save')}</button></>}>
      <form id="product-form" onSubmit={submit} className="space-y-4">
        <Field label={t('Barcode')} hint={!product ? t('Scan or type the barcode first — if the product exists you can just add stock.') : null}>
          <div className="flex gap-2">
            <input className="input font-mono" dir="ltr" inputMode="numeric" value={form.barcode} onChange={set('barcode')} placeholder="6291100100017" />
            <button type="button" className="btn-secondary btn-icon" onClick={() => setScan((s) => !s)} aria-label={t('Scan barcode')}><Icon name="scan" /></button>
          </div>
        </Field>
        {scan && <BarcodeScanner continuous={false} onDetected={onScanned} />}

        {restockMode ? (
          <RestockCard product={existing} stock={stockMap.get(existing.id) || 0} expiry={expiry.get(existing.id)} form={restock} setForm={setRestock} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {product && existing && (
              <p className="flex items-center gap-2 rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300 sm:col-span-2">
                <Icon name="alert" className="h-4 w-4" />{t('This barcode is already used by {name}', { name: existing.name })}
              </p>
            )}
            <Field label={t('Product name')} className="sm:col-span-2"><input className="input" required value={form.name} onChange={set('name')} /></Field>
            <Field label={t('Brand')}><input className="input" value={form.brand} onChange={set('brand')} /></Field>
            <Field label={t('Category')}>
              <select className="input" value={form.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c} value={c}>{t(c)}</option>)}</select>
            </Field>
            <Field label={`${t('Selling price')} (${settings.currency})`}><input className="input" inputMode="decimal" required value={form.price} onChange={(e) => setForm({ ...form, price: numeric(e.target.value) })} /></Field>
            <Field label={`${t('Cost price')} (${settings.currency})`}><input className="input" inputMode="decimal" value={form.cost} onChange={(e) => setForm({ ...form, cost: numeric(e.target.value) })} /></Field>
            <Field label={product ? t('Stock on hand') : t('Quantity')} hint={product ? t('Change it to correct the count — the difference is saved in the stock ledger.') : null}>
              <input className="input font-semibold" inputMode="numeric" value={qty} onChange={(e) => setQty(integer(e.target.value))} />
            </Field>
            <Field label={t('Expiry date')}><input type="date" className="input" value={form.expiryDate} onChange={set('expiryDate')} /></Field>
            <Field label={t('Unit')}><input className="input" value={form.unit} onChange={set('unit')} /></Field>
            <Field label={t('Description / usage notes')} className="sm:col-span-2">
              <textarea className="input" rows={2} value={form.description} onChange={set('description')} />
            </Field>
          </div>
        )}
      </form>
    </Sheet>
  );
}

function StockSheet({ product, stock, onClose }) {
  const t = useT();
  const toast = useToast();
  const movements = useMovements(product?.id);
  const [mode, setMode] = useState('set');
  const [target, setTarget] = useState('');
  const [qty, setQty] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [reason, setReason] = useState('damaged');
  const [note, setNote] = useState('');
  useEffect(() => { setMode('set'); setTarget(String(stock)); setQty(''); setExpiryDate(''); setNote(''); }, [product]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!product) return null;
  const lots = lotsFor(movements, product.expiryDate);

  const submit = async (e) => {
    e.preventDefault();
    try {
      if (mode === 'set') {
        const diff = correctionFor(stock, target);
        if (!diff) { toast(t('Stock unchanged')); return; }
        await adjustStock(product.id, diff, 'adjustment', note || t('Stock count'));
        toast(t('Stock set to {n}', { n: target }));
      } else if (mode === 'in') {
        await receiveStock(product.id, qty, expiryDate, note || t('Restock'));
        toast(t('Added {n} to {name}', { n: qty, name: product.name }));
      } else {
        const r = OUT_REASONS.find((x) => x.id === reason);
        const n = Number(qty);
        if (!n) return;
        await adjustStock(product.id, r.sign === 1 ? n : -n, reason, note);
        toast(t('Stock {n} recorded', { n: `${r.sign === 1 ? '+' : '−'}${n}` }));
      }
      setQty(''); setNote(''); setExpiryDate('');
    } catch (err) {
      toast(t(err.message), 'error');
    }
  };

  return (
    <Sheet open title={product.name} onClose={onClose} size="lg">
      <div className="mb-4 flex items-center justify-between rounded-2xl bg-brand-500/10 px-4 py-3">
        <span className="text-sm font-semibold text-accent">{t('On hand')}</span>
        <span className="text-3xl font-bold tabular-nums text-ink">{number(stock)} <span className="text-base font-medium text-muted">{product.unit}</span></span>
      </div>
      {lots.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {lots.map((l) => (
            <span key={l.expiryDate || 'none'} className="badge bg-subtle px-3 py-1 text-sm text-ink">
              {number(l.qty)} · {l.expiryDate ? `${t('Exp')} ${date(l.expiryDate)}` : t('No expiry')}
            </span>
          ))}
        </div>
      )}

      <Segmented value={mode} onChange={setMode} options={[
        { value: 'set', label: t('Set count'), icon: 'edit' },
        { value: 'in', label: t('Receive'), icon: 'plus' },
        { value: 'out', label: t('Remove'), icon: 'minus' },
      ]} />

      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
        {mode === 'set' && (
          <Field label={t('Counted quantity')} className="sm:col-span-2">
            <div className="flex items-center gap-2">
              <button type="button" className="btn-secondary btn-icon" onClick={() => setTarget(String(Math.max(0, Number(target) - 1)))} aria-label={t('Decrease quantity')}><Icon name="minus" /></button>
              <input className="input text-center text-xl font-bold tabular-nums" inputMode="numeric" value={target} onChange={(e) => setTarget(integer(e.target.value))} />
              <button type="button" className="btn-secondary btn-icon" onClick={() => setTarget(String(Number(target) + 1))} aria-label={t('Increase quantity')}><Icon name="plus" /></button>
            </div>
          </Field>
        )}
        {mode === 'in' && (
          <>
            <Field label={t('Quantity received')}><input className="input" inputMode="numeric" required value={qty} onChange={(e) => setQty(integer(e.target.value))} /></Field>
            <Field label={t('New expiry date')}><input type="date" className="input" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} /></Field>
          </>
        )}
        {mode === 'out' && (
          <>
            <Field label={t('Reason')}>
              <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
                {OUT_REASONS.map((x) => <option key={x.id} value={x.id}>{t(x.label)}</option>)}
              </select>
            </Field>
            <Field label={t('Quantity')}><input className="input" inputMode="numeric" required value={qty} onChange={(e) => setQty(integer(e.target.value))} /></Field>
          </>
        )}
        <Field label={t('Note (optional)')} className="sm:col-span-2"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="sm:col-span-2"><button type="submit" className="btn-primary w-full">{t('Save')}</button></div>
      </form>

      <h3 className="mb-2 mt-6 text-sm font-semibold text-ink">{t('Stock ledger')}</h3>
      <ul className="divide-y divide-line rounded-2xl border border-line text-sm">
        {movements.length === 0 && <li className="p-3 text-muted">{t('No movements yet.')}</li>}
        {movements.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0">
              <div className="font-medium text-ink">{t(REASON_LABELS[m.reason] || m.reason)}{m.note ? <span className="font-normal text-muted"> · {m.note}</span> : null}</div>
              <div className="text-xs text-faint">{dateTime(m.created_at)}{m.expiryDate ? ` · ${t('Exp')} ${date(m.expiryDate)}` : ''}</div>
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
  const expiry = useExpiry();
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
  const expOf = (p) => expiry.get(p.id) ?? p.expiryDate;
  const rows = useMemo(() => {
    if (!products) return [];
    const needle = q.trim().toLowerCase();
    return products.filter((p) => {
      if (cat !== 'All' && p.category !== cat) return false;
      const s = stock.get(p.id) || 0;
      const exp = expiry.get(p.id) ?? p.expiryDate;
      if (view === 'low' && s > (p.reorderLevel || 0)) return false;
      if (view === 'expiring' && !(exp && exp <= soon)) return false;
      return !needle || [p.name, p.sku, p.barcode, p.brand].some((v) => String(v || '').toLowerCase().includes(needle));
    });
  }, [products, q, cat, view, stock, expiry, soon]);
  const stockValue = useMemo(() => (products || []).reduce((s, p) => s + Math.max(0, stock.get(p.id) || 0) * (Number(p.cost) || 0), 0), [products, stock]);

  const openNew = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (p) => { setEditing(p); setFormOpen(true); };
  const remove = async (p) => {
    if (!(await confirm({ title: t('Delete product'), message: t('Delete {name}? Existing invoices are not affected.', { name: p.name }), danger: true, confirmLabel: t('Delete') }))) return;
    await deleteProduct(p.id);
    toast(t('Product deleted'));
  };

  /** Stock pill — tapping it opens the stock editor. */
  const StockButton = ({ p }) => {
    const s = stock.get(p.id) || 0;
    const tone = s <= 0 ? 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300'
      : s <= (p.reorderLevel || 0) ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
        : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
    return (
      <button type="button" onClick={() => setStockFor(p)} title={t('Edit stock')} aria-label={t('Edit stock')}
        className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border px-2.5 text-sm font-bold tabular-nums transition active:scale-95 ${tone}`}>
        {number(s)}<Icon name="edit" className="h-3.5 w-3.5 opacity-70" />
      </button>
    );
  };
  const expiryText = (p) => {
    const exp = expOf(p);
    if (!exp) return <span className="text-faint">—</span>;
    const cls = exp < today ? 'font-semibold text-rose-600' : exp <= soon ? 'font-semibold text-amber-600' : 'text-muted';
    return <span className={cls}>{date(exp)}</span>;
  };

  return (
    <div>
      <PageHeader title={t('Products')} subtitle={products ? t('{n} products · stock value {amount}', { n: products.length, amount: money(stockValue) }) : ''}
        actions={<button type="button" className="btn-primary hidden lg:inline-flex" onClick={openNew}><Icon name="plus" className="h-4 w-4" />{t('Add product')}</button>} />

      <div className="sticky top-[57px] z-10 -mx-4 mb-4 space-y-3 bg-canvas/95 px-4 py-2 backdrop-blur-lg lg:top-0 lg:mx-0 lg:px-0">
        <div className="relative">
          <Icon name="search" className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input className="input ps-9" placeholder={t('Search name or barcode…')} value={q} onChange={(e) => setQ(e.target.value)} />
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
                    <th className="table-th">{t('Product')}</th><th className="table-th">{t('Barcode')}</th>
                    <th className="table-th">{t('Expiry')}</th><th className="table-th text-end">{t('Price')}</th><th className="table-th text-end">{t('Stock')}</th><th className="table-th" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((p) => (
                    <tr key={p.id} className="transition hover:bg-subtle">
                      <td className="table-td"><div className="font-semibold">{p.name}</div><div className="text-xs text-muted">{p.brand} · {t(p.category)}</div></td>
                      <td className="table-td font-mono text-xs" dir="ltr">{p.barcode || '—'}</td>
                      <td className="table-td">{expiryText(p)}</td>
                      <td className="table-td text-end tabular-nums">{money(p.price)}</td>
                      <td className="table-td text-end"><StockButton p={p} /></td>
                      <td className="table-td whitespace-nowrap text-end">
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
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                        <span className="font-semibold text-ink">{money(p.price)}</span><span>· {t('Exp')} {expiryText(p)}</span>
                      </div>
                    </button>
                    <StockButton p={p} />
                  </li>
                ))}
              </ul>
            </>
          )}
      </div>

      <Fab label={t('Add product')} onClick={openNew} />
      <ProductForm open={formOpen} product={editing} onClose={() => setFormOpen(false)} stockMap={stock} expiry={expiry} />
      {stockFor && <StockSheet product={stockFor} stock={stock.get(stockFor.id) || 0} onClose={() => setStockFor(null)} />}
    </div>
  );
}
