/**
 * Product lookup for the POS: type-ahead search by name/SKU/barcode, keyboard-
 * wedge USB scanners (they type the code + Enter), and the camera scanner.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Icon, Modal } from './ui.jsx';
import BarcodeScanner from './BarcodeScanner.jsx';
import { searchProducts, findProductByCode } from '../db/repo.js';
import { candidateCodes, parseGS1 } from '../lib/barcode.js';
import { money } from '../lib/format.js';

export default function ProductPicker({ onAdd, stock, inCart }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [active, setActive] = useState(0);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const inputRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      const r = await searchProducts(query, 12);
      if (alive) { setResults(r); setActive(0); }
    }, 120);
    return () => { alive = false; clearTimeout(t); };
  }, [query]);

  useEffect(() => {
    const close = (e) => { if (!boxRef.current?.contains(e.target)) setResults([]); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const available = (p) => (stock.get(p.id) || 0) - (inCart.get(p.id) || 0);

  /** Resolve a scanned/typed code to a product and add it. Returns a status. */
  const handleCode = async (raw) => {
    const product = await findProductByCode(candidateCodes(raw));
    if (!product) return { ok: false, message: `No product found for “${raw}”` };
    const gs1 = parseGS1(raw);
    onAdd(product, { batchNumber: gs1?.batch || null, expiry: gs1?.expiry || null });
    const left = available(product) - 1;
    return { ok: true, message: `+1 ${product.name}${left < 0 ? ' — out of stock!' : ` (${left} left)`}` };
  };

  const add = (p) => {
    onAdd(p, {});
    setQuery('');
    setResults([]);
    inputRef.current?.focus();
  };

  const onKeyDown = async (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === 'Escape') setResults([]);
    if (e.key === 'Enter') {
      e.preventDefault();
      const q = query.trim();
      if (!q) return;
      const exact = await findProductByCode(candidateCodes(q));
      if (exact) {
        await handleCode(q);
        setQuery('');
        setResults([]);
      } else if (results[active]) {
        add(results[active]);
      }
    }
  };

  const onScan = async (code) => {
    const res = await handleCode(code);
    setScanResult({ ...res, at: Date.now() });
  };

  useEffect(() => {
    if (!scanResult) return undefined;
    const t = setTimeout(() => setScanResult(null), 2200);
    return () => clearTimeout(t);
  }, [scanResult]);

  return (
    <div ref={boxRef} className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input ref={inputRef} className="input pl-9" value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown} placeholder="Search product, SKU or scan with USB scanner…"
            autoComplete="off" aria-label="Search products" />
        </div>
        <button type="button" className="btn-primary shrink-0" onClick={() => setScanOpen(true)}>
          <Icon name="scan" /> <span className="hidden sm:inline">Scan</span>
        </button>
      </div>

      {results.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {results.map((p, i) => {
            const left = available(p);
            return (
              <li key={p.id}>
                <button type="button" onMouseEnter={() => setActive(i)} onClick={() => add(p)}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left ${i === active ? 'bg-brand-50' : ''}`}>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-900">{p.name}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {p.sku}{p.batchNumber ? ` · Batch ${p.batchNumber}` : ''}{p.barcode ? ` · ${p.barcode}` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold">{money(p.price)}</span>
                    <span className={`block text-xs ${left <= 0 ? 'text-rose-600' : 'text-slate-500'}`}>{left} in stock</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Modal open={scanOpen} title="Scan products" onClose={() => setScanOpen(false)}
        footer={<button type="button" className="btn-primary" onClick={() => setScanOpen(false)}>Done</button>}>
        {scanOpen && <BarcodeScanner continuous onDetected={onScan} lastResult={scanResult} />}
        <p className="mt-3 text-xs text-slate-500">
          Each scan adds one unit to the invoice. Stock is reserved in the cart and deducted when the invoice is issued.
        </p>
      </Modal>
    </div>
  );
}
