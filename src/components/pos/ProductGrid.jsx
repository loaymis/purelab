/**
 * Tap-to-add product browser for the POS: search, category chips, camera scan,
 * and keyboard-wedge (USB) scanners via Enter in the search box.
 */
import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Icon, Sheet, EmptyState, Skeleton } from '../ui.jsx';
import BarcodeScanner from '../BarcodeScanner.jsx';
import { useT } from '../../i18n/index.js';
import { money, todayISO, addDaysISO } from '../../lib/format.js';
import { findProductByCode } from '../../db/repo.js';
import { candidateCodes, parseGS1 } from '../../lib/barcode.js';
import { CATEGORIES, useSettings } from '../../lib/settings.js';

const CAT_TONES = {
  Pharmaceutical: 'from-sky-500 to-sky-700',
  'Dermo-cosmetic': 'from-brand-500 to-brand-700',
  Supplement: 'from-amber-400 to-amber-600',
  'Medical device': 'from-violet-500 to-violet-700',
  Other: 'from-slate-400 to-slate-600',
};

export default function ProductGrid({ products, stock, expiry, inCart, onAdd, searchRef }) {
  const t = useT();
  const settings = useSettings();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [scanOpen, setScanOpen] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const localRef = useRef(null);
  const inputRef = searchRef || localRef;

  const soon = addDaysISO(todayISO(), settings.expiryWarningDays);
  const today = todayISO();
  const cats = useMemo(() => {
    const present = new Set((products || []).map((p) => p.category));
    return ['All', ...CATEGORIES.filter((c) => present.has(c))];
  }, [products]);

  const filtered = useMemo(() => {
    if (!products) return [];
    const n = q.trim().toLowerCase();
    return products.filter((p) => (cat === 'All' || p.category === cat)
      && (!n || [p.name, p.sku, p.barcode, p.brand].some((v) => String(v || '').toLowerCase().includes(n))));
  }, [products, q, cat]);

  const available = (p) => (stock.get(p.id) || 0) - (inCart.get(p.id) || 0);

  const handleCode = async (raw) => {
    const product = await findProductByCode(candidateCodes(raw));
    if (!product) return { ok: false, message: t('No product found for “{code}”', { code: raw }) };
    const gs1 = parseGS1(raw);
    onAdd(product, { batchNumber: gs1?.batch || null, expiry: gs1?.expiry || null });
    const left = available(product) - 1;
    return { ok: true, message: left < 0 ? t('+1 {name} — out of stock!', { name: product.name }) : t('+1 {name} ({n} left)', { name: product.name, n: left }) };
  };

  const onKeyDown = async (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const code = q.trim();
    if (!code) return;
    const res = await handleCode(code);
    if (res.ok) setQ('');
    else if (filtered.length === 1) { onAdd(filtered[0], {}); setQ(''); }
  };

  useEffect(() => {
    if (!scanResult) return undefined;
    const id = setTimeout(() => setScanResult(null), 2200);
    return () => clearTimeout(id);
  }, [scanResult]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Icon name="search" className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input ref={inputRef} className="input ps-9" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown}
            placeholder={t('Search or scan barcode…')} autoComplete="off" aria-label={t('Search products')} />
        </div>
        <button type="button" className="btn-primary px-3.5" onClick={() => setScanOpen(true)} aria-label={t('Scan')}>
          <Icon name="scan" /><span className="hidden sm:inline">{t('Scan')}</span>
        </button>
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {cats.map((c) => (
          <button key={c} type="button" onClick={() => setCat(c)} className={`chip ${cat === c ? 'chip-active' : ''}`}>{t(c)}</button>
        ))}
      </div>

      {products === undefined ? (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card"><EmptyState icon="box" title={products.length ? t('No matching products') : t('No products yet')}
          text={products.length ? t('Try another search or category.') : t('Add products in the Products tab, or load demo data in Settings.')} /></div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => {
            const left = available(p);
            const qty = inCart.get(p.id) || 0;
            const exp = expiry?.get(p.id) ?? p.expiryDate;
            const expired = exp && exp < today;
            const expiring = !expired && exp && exp <= soon;
            return (
              <button key={p.id} type="button" onClick={() => onAdd(p, {})}
                className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-surface p-3 text-start shadow-card transition hover:-translate-y-0.5 hover:shadow-pop active:scale-[.97] ${
                  qty ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-line'}`}>
                <div className="flex items-start justify-between gap-2">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-sm font-bold text-white ${CAT_TONES[p.category] || CAT_TONES.Other}`}>
                    {(p.name || '?').replace(/^PureLab\s+/i, '').slice(0, 2).toUpperCase()}
                  </span>
                  {qty > 0 && <span className="badge animate-pop bg-brand-600 text-white">×{qty}</span>}
                </div>
                <span className="mt-2 line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-tight text-ink">{p.name}</span>
                <span className="mt-auto flex items-end justify-between gap-2 pt-2">
                  <span className="text-base font-bold text-ink">{money(p.price)}</span>
                  <span className={`text-[11px] font-semibold ${left <= 0 ? 'text-rose-600' : left <= (p.reorderLevel || 0) ? 'text-amber-600' : 'text-faint'}`}>
                    {left <= 0 ? t('Out of stock') : t('{n} left', { n: left })}
                  </span>
                </span>
                {(expired || expiring) && (
                  <span className={`absolute end-2 top-12 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${expired ? 'bg-rose-600 text-white' : 'bg-amber-500/20 text-amber-700 dark:text-amber-300'}`}>
                    {expired ? t('Expired') : t('Expiring')}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <Sheet open={scanOpen} title={t('Scan products')} onClose={() => setScanOpen(false)}
        footer={<button type="button" className="btn-primary w-full sm:w-auto" onClick={() => setScanOpen(false)}>{t('Done')}</button>}>
        {scanOpen && <BarcodeScanner continuous onDetected={async (code) => setScanResult({ ...(await handleCode(code)), at: Date.now() })} lastResult={scanResult} />}
        <p className="mt-3 text-xs text-faint">{t('Each scan adds one unit. Stock is deducted when the sale is completed.')}</p>
      </Sheet>
    </div>
  );
}
