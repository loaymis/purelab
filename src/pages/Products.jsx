/** Product catalogue: batches, expiry, pricing, VAT, barcodes and stock ledger. */
import React, { useEffect, useMemo, useState } from 'react';
import { Icon, Modal, Field, PageHeader, EmptyState, useToast } from '../components/ui.jsx';
import BarcodeScanner from '../components/BarcodeScanner.jsx';
import { useProducts, useStock, useMovements } from '../db/hooks.js';
import { saveProduct, deleteProduct, adjustStock } from '../db/repo.js';
import { CATEGORIES, useSettings } from '../lib/settings.js';
import { money, number, date, dateTime, addDaysISO, todayISO } from '../lib/format.js';
import { parseGS1 } from '../lib/barcode.js';

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

function ProductForm({ open, product, onClose }) {
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
      toast(product ? 'Product updated' : 'Product created');
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <Modal open={open} title={product ? `Edit ${product.name}` : 'New product'} onClose={onClose} size="lg"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" form="product-form" className="btn-primary">Save</button></>}>
      <form id="product-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Product name" className="sm:col-span-2"><input className="input" required value={form.name} onChange={set('name')} /></Field>
        <Field label="Brand"><input className="input" value={form.brand} onChange={set('brand')} /></Field>
        <Field label="Category">
          <select className="input" value={form.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
        </Field>
        <Field label="SKU"><input className="input font-mono" value={form.sku} onChange={set('sku')} /></Field>
        <Field label="Barcode (EAN / UPC / GTIN)">
          <div className="flex gap-2">
            <input className="input font-mono" value={form.barcode} onChange={set('barcode')} />
            <button type="button" className="btn-secondary px-3" onClick={() => setScan((s) => !s)} aria-label="Scan barcode"><Icon name="scan" /></button>
          </div>
        </Field>
        {scan && <div className="sm:col-span-2"><BarcodeScanner continuous={false} onDetected={onScanned} /></div>}
        <Field label="Batch / Lot number"><input className="input font-mono" value={form.batchNumber} onChange={set('batchNumber')} /></Field>
        <Field label="Expiry date"><input type="date" className="input" value={form.expiryDate} onChange={set('expiryDate')} /></Field>
        <Field label={`Selling price (${settings.currency})`}><input className="input" inputMode="decimal" required value={form.price} onChange={set('price')} /></Field>
        <Field label={`Cost price (${settings.currency})`}><input className="input" inputMode="decimal" value={form.cost} onChange={set('cost')} /></Field>
        <Field label="VAT %"><input className="input" inputMode="decimal" value={form.taxRate} onChange={set('taxRate')} /></Field>
        <Field label="Reorder level"><input className="input" inputMode="numeric" value={form.reorderLevel} onChange={set('reorderLevel')} /></Field>
        {!product && (
          <Field label="Opening stock" hint="Initial quantity on hand (recorded in the stock ledger).">
            <input className="input" inputMode="numeric" value={opening} onChange={(e) => setOpening(e.target.value.replace(/[^0-9-]/g, ''))} />
          </Field>
        )}
        <Field label="Unit"><input className="input" value={form.unit} onChange={set('unit')} /></Field>
        <Field label="Description / usage notes" className="sm:col-span-2">
          <textarea className="input" rows={2} value={form.description} onChange={set('description')} />
        </Field>
      </form>
    </Modal>
  );
}

function StockModal({ product, stock, onClose }) {
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
    toast(`Stock ${n > 0 ? '+' : ''}${n} recorded`);
    setQty('');
    setNote('');
  };

  return (
    <Modal open title={`Stock — ${product.name}`} onClose={onClose} size="lg">
      <div className="mb-4 flex items-center justify-between rounded-lg bg-brand-50 px-4 py-3">
        <span className="text-sm text-brand-800">On hand</span>
        <span className="text-2xl font-bold text-brand-900">{number(stock)} {product.unit}</span>
      </div>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_120px]">
        <Field label="Movement">
          <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
            {REASONS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
        </Field>
        <Field label={r.sign === 0 ? 'Qty (+/−)' : 'Quantity'}>
          <input className="input" inputMode="numeric" required value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9-]/g, ''))} />
        </Field>
        <Field label="Note (supplier invoice, batch…)" className="sm:col-span-2"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="sm:col-span-2"><button type="submit" className="btn-primary w-full sm:w-auto">Record movement</button></div>
      </form>
      <h3 className="mb-2 mt-6 text-sm font-semibold text-slate-700">Ledger</h3>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
        {movements.length === 0 && <li className="p-3 text-slate-500">No movements yet.</li>}
        {movements.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <div className="font-medium capitalize">{m.reason}{m.note ? <span className="font-normal text-slate-500"> · {m.note}</span> : null}</div>
              <div className="text-xs text-slate-500">{dateTime(m.created_at)}</div>
            </div>
            <span className={`font-mono font-semibold ${m.qty < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{m.qty > 0 ? '+' : ''}{m.qty}</span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

export default function Products() {
  const products = useProducts();
  const stock = useStock();
  const settings = useSettings();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [view, setView] = useState('all');
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [stockFor, setStockFor] = useState(null);

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

  const openNew = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (p) => { setEditing(p); setFormOpen(true); };
  const remove = async (p) => {
    if (!window.confirm(`Delete ${p.name}? Existing invoices are not affected.`)) return;
    await deleteProduct(p.id);
    toast('Product deleted');
  };

  const stockBadge = (p) => {
    const s = stock.get(p.id) || 0;
    const tone = s <= 0 ? 'bg-rose-100 text-rose-800' : s <= (p.reorderLevel || 0) ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800';
    return <span className={`badge ${tone}`}>{number(s)}</span>;
  };
  const expiryText = (p) => {
    if (!p.expiryDate) return <span className="text-slate-400">—</span>;
    const cls = p.expiryDate < today ? 'text-rose-600 font-semibold' : p.expiryDate <= soon ? 'text-amber-700 font-semibold' : '';
    return <span className={cls}>{date(p.expiryDate)}</span>;
  };

  return (
    <div>
      <PageHeader title="Products" subtitle={products ? `${products.length} products` : ''}
        actions={<button type="button" className="btn-primary" onClick={openNew}><Icon name="plus" className="h-4 w-4" /> Add product</button>} />

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search name, SKU, barcode, batch…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
          <option>All</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className="input" value={view} onChange={(e) => setView(e.target.value)} aria-label="Filter">
          <option value="all">All stock</option><option value="low">Low / out of stock</option><option value="expiring">Expiring soon</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        {products === undefined ? <div className="p-8 text-center text-slate-500">Loading…</div>
          : rows.length === 0 ? <EmptyState title="No products" text="Add your catalogue, or load demo data from Settings → Data." action={<button type="button" className="btn-primary" onClick={openNew}>Add product</button>} />
            : (
              <>
                <table className="hidden w-full lg:table">
                  <thead className="border-b border-slate-200 bg-slate-50">
                    <tr>
                      <th className="table-th">Product</th><th className="table-th">SKU / Barcode</th><th className="table-th">Batch</th>
                      <th className="table-th">Expiry</th><th className="table-th text-right">Price</th><th className="table-th text-right">Stock</th><th className="table-th" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="table-td"><div className="font-semibold text-slate-900">{p.name}</div><div className="text-xs text-slate-500">{p.brand} · {p.category}</div></td>
                        <td className="table-td font-mono text-xs">{p.sku}<div className="text-slate-500">{p.barcode}</div></td>
                        <td className="table-td font-mono text-xs">{p.batchNumber || '—'}</td>
                        <td className="table-td">{expiryText(p)}</td>
                        <td className="table-td text-right">{money(p.price)}{p.taxRate ? <div className="text-xs text-slate-500">+{p.taxRate}% VAT</div> : null}</td>
                        <td className="table-td text-right">{stockBadge(p)}</td>
                        <td className="table-td text-right whitespace-nowrap">
                          <button type="button" className="btn-ghost btn-sm" onClick={() => setStockFor(p)}>Stock</button>
                          <button type="button" className="btn-ghost btn-sm" onClick={() => openEdit(p)} aria-label="Edit"><Icon name="edit" className="h-4 w-4" /></button>
                          <button type="button" className="btn-ghost btn-sm text-rose-600" onClick={() => remove(p)} aria-label="Delete"><Icon name="trash" className="h-4 w-4" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <ul className="divide-y divide-slate-100 lg:hidden">
                  {rows.map((p) => (
                    <li key={p.id} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <button type="button" className="min-w-0 text-left" onClick={() => openEdit(p)}>
                          <div className="font-semibold text-slate-900">{p.name}</div>
                          <div className="text-xs text-slate-500">{p.sku} · Batch {p.batchNumber || '—'} · Exp {expiryText(p)}</div>
                        </button>
                        <div className="text-right"><div className="font-bold">{money(p.price)}</div>{stockBadge(p)}</div>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <button type="button" className="btn-secondary btn-sm" onClick={() => setStockFor(p)}>Stock</button>
                        <button type="button" className="btn-secondary btn-sm" onClick={() => openEdit(p)}>Edit</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
      </div>

      <ProductForm open={formOpen} product={editing} onClose={() => setFormOpen(false)} />
      {stockFor && <StockModal product={stockFor} stock={stock.get(stockFor.id) || 0} onClose={() => setStockFor(null)} />}
    </div>
  );
}
