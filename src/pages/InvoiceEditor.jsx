/**
 * POS / invoice editor — /pos (new sale) and /invoices/:id/edit.
 *
 * Phones: Products ⇄ Cart tabs + sticky "Charge" bar → checkout sheet.
 * Desktop: product grid on the left, cart & totals on the right.
 * Shortcuts: F2 search · F8 save draft · F9 checkout.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ProductGrid from '../components/pos/ProductGrid.jsx';
import Cart from '../components/pos/Cart.jsx';
import CheckoutSheet from '../components/pos/CheckoutSheet.jsx';
import SaleComplete from '../components/pos/SaleComplete.jsx';
import { Icon, Segmented, useToast, useConfirm } from '../components/ui.jsx';
import { useCustomers, useInvoice, useStock, useBalances, useProducts } from '../db/hooks.js';
import { saveInvoice, newInvoiceDraft } from '../db/repo.js';
import { computeTotals } from '../lib/calc.js';
import { money, addDaysISO } from '../lib/format.js';
import { PAYMENT_METHODS, useSettings } from '../lib/settings.js';
import { useT } from '../i18n/index.js';
import { uuid } from '../lib/ids.js';

const lineKey = () => uuid().slice(0, 8);

export default function InvoiceEditor() {
  const t = useT();
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const settings = useSettings();
  const products = useProducts();
  const customers = useCustomers();
  const balances = useBalances();
  const stock = useStock();
  const existing = useInvoice(id);

  const [inv, setInv] = useState(() => (id ? null : newInvoiceDraft()));
  const [originalQty, setOriginalQty] = useState(new Map());
  const [checkout, setCheckout] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null);
  const [mobileTab, setMobileTab] = useState('products');
  const [bump, setBump] = useState(0);
  const searchRef = useRef(null);

  // Load an existing invoice once.
  useEffect(() => {
    if (!id || inv || existing === undefined) return;
    if (!existing || existing.deleted) { navigate('/invoices', { replace: true }); return; }
    if (existing.status === 'void') { navigate(`/invoices/${id}`, { replace: true }); return; }
    setInv({ ...existing, items: existing.items.map((i) => ({ ...i, key: i.key || lineKey() })) });
    if (existing.status === 'issued') {
      const m = new Map();
      existing.items.forEach((i) => m.set(i.productId, (m.get(i.productId) || 0) + Number(i.qty)));
      setOriginalQty(m);
    }
  }, [id, existing, inv, navigate]);

  const update = useCallback((patch) => setInv((cur) => ({ ...cur, ...patch })), []);
  const updateItem = useCallback((key, patch) => setInv((cur) => ({
    ...cur, items: cur.items.map((i) => (i.key === key ? { ...i, ...patch } : i)),
  })), []);
  const removeItem = useCallback((key) => setInv((cur) => ({ ...cur, items: cur.items.filter((i) => i.key !== key) })), []);

  const addProduct = useCallback((p, extra = {}) => {
    setBump((b) => b + 1);
    if (navigator.vibrate) navigator.vibrate(15);
    setInv((cur) => {
      const batch = extra.batchNumber || p.batchNumber || '';
      const idx = cur.items.findIndex((i) => i.productId === p.id && (i.batchNumber || '') === batch);
      if (idx >= 0) {
        const items = [...cur.items];
        items[idx] = { ...items[idx], qty: Number(items[idx].qty) + 1 };
        return { ...cur, items };
      }
      return {
        ...cur,
        items: [...cur.items, {
          key: lineKey(), productId: p.id, sku: p.sku, name: p.name, batchNumber: batch,
          expiryDate: extra.expiry || p.expiryDate || '', qty: 1, price: p.price,
          discountPct: 0, taxRate: p.taxRate ?? settings.defaultTaxRate,
        }],
      };
    });
  }, [settings.defaultTaxRate]);

  const totals = useMemo(() => (inv ? computeTotals(inv.items, inv, inv.payments) : null), [inv]);
  const cartQty = useMemo(() => {
    const m = new Map();
    inv?.items.forEach((i) => m.set(i.productId, (m.get(i.productId) || 0) + (Number(i.qty) || 0)));
    return m;
  }, [inv]);
  // Stock the grid sees: ledger + what this (already issued) invoice deducted.
  const effectiveStock = useMemo(() => {
    const m = new Map(stock);
    originalQty.forEach((q, pid) => m.set(pid, (m.get(pid) || 0) + q));
    return m;
  }, [stock, originalQty]);
  const shortages = useMemo(() => {
    const out = new Set();
    cartQty.forEach((q, pid) => { if (q > (effectiveStock.get(pid) || 0)) out.add(pid); });
    return out;
  }, [cartQty, effectiveStock]);

  const editingIssued = existing?.status === 'issued';
  const hasItems = inv?.items.some((i) => Number(i.qty) > 0);

  const save = async (status) => {
    if (saving) return;
    if (!hasItems) { toast(t('Add at least one product'), 'error'); return; }
    if (status === 'issued') {
      if (totals.balance > 0 && !inv.customerId) {
        toast(t('Select a customer for credit or partly paid sales'), 'error');
        setCheckout(true);
        return;
      }
      const missingRef = inv.payments.find((p) => Number(p.amount) > 0 && PAYMENT_METHODS.find((m) => m.id === p.method)?.needsRef && !p.reference?.trim());
      if (missingRef && !(await confirm({ title: t('Missing payment reference'), message: t('Some card / transfer / USDT payments have no reference. Complete the sale anyway?'), confirmLabel: t('Complete anyway') }))) return;
      if (shortages.size && !(await confirm({ title: t('Not enough stock'), message: t('Some items exceed available stock. Stock will go negative. Continue?'), confirmLabel: t('Continue'), danger: true }))) return;
      const customer = customers?.find((c) => c.id === inv.customerId);
      if (customer?.creditLimit > 0) {
        const prevOwed = (balances.get(customer.id) || 0) - (editingIssued ? existing.totals?.balance || 0 : 0);
        if (prevOwed + totals.balance > customer.creditLimit) toast(t('Credit limit of {amount} exceeded', { amount: money(customer.creditLimit) }), 'warn');
      }
    }
    setSaving(true);
    try {
      const dueDate = inv.dueDate || (Number(inv.paymentTermsDays) > 0 ? addDaysISO(inv.date, inv.paymentTermsDays) : '');
      const payments = inv.payments.filter((p) => Number(p.amount) > 0);
      const { _payLater, ...clean } = inv;
      const saved = await saveInvoice({ ...clean, dueDate, payments }, status);
      setCheckout(false);
      if (status === 'issued' && !id) {
        setDone(saved);
      } else {
        toast(status === 'issued' ? t('Invoice {n} updated', { n: saved.number }) : t('Draft {n} saved', { n: saved.number }));
        navigate(`/invoices/${saved.id}`, { replace: !!id });
      }
    } catch (err) {
      toast(err.message || t('Could not save the invoice'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const openCheckout = () => {
    if (!hasItems) { toast(t('Add at least one product'), 'error'); return; }
    setCheckout(true);
  };

  const saveRef = useRef(save);
  saveRef.current = save;
  const checkoutRef = useRef(openCheckout);
  checkoutRef.current = openCheckout;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'F8') { e.preventDefault(); saveRef.current('draft'); }
      if (e.key === 'F9') { e.preventDefault(); checkoutRef.current(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (done) {
    return <SaleComplete invoice={done} onNewSale={() => { setDone(null); setInv(newInvoiceDraft()); setMobileTab('products'); }} />;
  }
  if (!inv || customers === undefined) {
    return <div className="flex justify-center p-10"><Icon name="refresh" className="h-6 w-6 animate-spin text-faint" /></div>;
  }

  const itemCount = totals.itemCount;
  const customer = customers.find((c) => c.id === inv.customerId);

  const cartPanel = (
    <div className="card flex flex-col">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <div className="font-semibold text-ink">{id ? inv.number : t('Current sale')}</div>
          <div className="text-xs text-muted">{customer ? customer.name : t('Walk-in customer')}</div>
        </div>
        {inv.items.length > 0 && !id && (
          <button type="button" className="text-xs font-semibold text-muted hover:text-rose-600"
            onClick={async () => { if (await confirm({ message: t('Clear all items from this sale?'), danger: true, confirmLabel: t('Clear') })) update({ items: [], payments: [] }); }}>
            {t('Clear')}
          </button>
        )}
      </div>
      <div className="max-h-[50vh] overflow-y-auto px-4 lg:max-h-[calc(100vh-22rem)]">
        <Cart items={inv.items} lineTotals={totals.lineTotals} shortages={shortages} stock={effectiveStock} onChange={updateItem} onRemove={removeItem} />
      </div>
      <div className="space-y-1.5 border-t border-line p-4 text-sm">
        {totals.lineDiscounts + totals.invoiceDiscount > 0 && (
          <div className="flex justify-between text-muted"><span>{t('Discounts')}</span><span className="tabular-nums">−{money(totals.lineDiscounts + totals.invoiceDiscount)}</span></div>
        )}
        {totals.tax > 0 && <div className="flex justify-between text-muted"><span>{t('VAT')}</span><span className="tabular-nums">{money(totals.tax)}</span></div>}
        <div className="flex items-end justify-between"><span className="font-semibold text-ink">{t('Total')}</span><span className="text-2xl font-bold tabular-nums text-ink">{money(totals.grandTotal)}</span></div>
        <div className="grid grid-cols-[auto_1fr] gap-2 pt-2">
          <button type="button" className="btn-secondary" disabled={saving || editingIssued || !hasItems} onClick={() => save('draft')} title="F8">{t('Draft')}</button>
          <button type="button" className="btn-primary text-base" disabled={!hasItems} onClick={openCheckout} title="F9">
            {editingIssued ? t('Review & update') : t('Charge {amount}', { amount: money(totals.grandTotal) })}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="pb-16 lg:pb-0">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">{id ? t('Edit {n}', { n: inv.number }) : t('New Sale')}</h1>
          {editingIssued && <p className="text-sm text-amber-600">{t('Editing an issued invoice — stock is recalculated when you update.')}</p>}
        </div>
        <span className="hidden text-xs text-faint xl:inline">F2 {t('search')} · F8 {t('draft')} · F9 {t('checkout')}</span>
        <div className="lg:hidden">
          <Segmented size="sm" value={mobileTab} onChange={setMobileTab} options={[
            { value: 'products', label: t('Products'), icon: 'grid' },
            { value: 'cart', label: `${t('Cart')} ${itemCount ? `(${itemCount})` : ''}`, icon: 'cart' },
          ]} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_400px]">
        <section className={`min-w-0 ${mobileTab === 'products' ? '' : 'hidden lg:block'}`}>
          <ProductGrid products={products} stock={effectiveStock} inCart={cartQty} onAdd={addProduct} searchRef={searchRef} />
        </section>
        <aside className={`min-w-0 lg:sticky lg:top-6 lg:self-start ${mobileTab === 'cart' ? '' : 'hidden lg:block'}`}>{cartPanel}</aside>
      </div>

      {/* Phone checkout bar (sits above the tab bar) */}
      <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-20 border-t border-line bg-surface/95 px-4 py-2.5 backdrop-blur-lg lg:hidden">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setMobileTab(mobileTab === 'cart' ? 'products' : 'cart')} className="relative rounded-xl bg-subtle p-2.5 text-ink" aria-label={t('Cart')}>
            <Icon name={mobileTab === 'cart' ? 'grid' : 'cart'} />
            {itemCount > 0 && (
              <span key={bump} className="absolute -end-1.5 -top-1.5 min-w-[20px] animate-pop rounded-full bg-brand-600 px-1 text-center text-[11px] font-bold leading-5 text-white">{itemCount}</span>
            )}
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold text-muted">{t('Total')}</div>
            <div className="text-lg font-bold leading-tight tabular-nums text-ink">{money(totals.grandTotal)}</div>
          </div>
          <button type="button" className="btn-primary px-6 text-base" disabled={!hasItems} onClick={openCheckout}>
            {editingIssued ? t('Review') : t('Charge')}<Icon name="arrowRight" className="h-4 w-4" />
          </button>
        </div>
      </div>

      <CheckoutSheet open={checkout} onClose={() => setCheckout(false)} inv={inv} update={update} totals={totals}
        customers={customers} balances={balances} busy={saving} editingIssued={editingIssued}
        onComplete={() => save('issued')} onSaveDraft={() => save('draft')} />
    </div>
  );
}
