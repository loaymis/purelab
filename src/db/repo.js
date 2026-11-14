/**
 * Repository: every business write goes through here so that sync metadata,
 * stock ledger and invoice totals stay consistent.
 *
 * Stock model: an append-only ledger (stock_movements). Current stock is
 * SUM(qty) of non-deleted movements. Sale movements use deterministic ids
 * (`sale:<invoiceId>:<productId>`), so if two offline devices edit the same
 * invoice, LWW converges to exactly one deduction per product — never double.
 */
import { db, nextLseq, isNewer } from './db.js';
import { uuid } from '../lib/ids.js';
import { computeTotals } from '../lib/calc.js';
import { getSettings } from '../lib/settings.js';
import { todayISO } from '../lib/format.js';

const changeListeners = new Set();
export const onLocalChange = (fn) => {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
};
const emitChange = () => changeListeners.forEach((fn) => fn());

/** Stamp a record with sync metadata. updated_at is forced monotonic per record. */
async function stamp(table, record) {
  const prev = record.id ? await db[table].get(record.id) : null;
  const now = Date.now();
  return {
    ...record,
    id: record.id || uuid(),
    created_at: prev?.created_at || record.created_at || now,
    updated_at: Math.max(now, (prev?.updated_at || 0) + 1),
    device_id: getSettings().deviceId,
    deleted: record.deleted ? 1 : 0,
    _lseq: await nextLseq(),
  };
}

async function write(table, record) {
  const stamped = await stamp(table, record);
  await db[table].put(stamped);
  return stamped;
}

const tx = (tables, fn) => db.transaction('rw', [...tables, db.sync_state], fn).then((r) => {
  emitChange();
  return r;
});

/* ----------------------------------------------------------------- products */

export function saveProduct(product, { openingStock = 0 } = {}) {
  return tx([db.products, db.stock_movements], async () => {
    const isNew = !product.id || !(await db.products.get(product.id));
    const saved = await write('products', {
      ...product,
      sku: (product.sku || '').trim(),
      barcode: (product.barcode || '').trim(),
      name: (product.name || '').trim(),
      price: Number(product.price) || 0,
      cost: Number(product.cost) || 0,
      taxRate: Number(product.taxRate) || 0,
      reorderLevel: Number(product.reorderLevel) || 0,
    });
    if (isNew && Number(openingStock) !== 0) {
      await write('stock_movements', {
        id: `opening:${saved.id}`,
        productId: saved.id,
        qty: Number(openingStock),
        reason: 'opening',
        note: 'Opening stock',
        batchNumber: saved.batchNumber || '',
      });
    }
    return saved;
  });
}

export function deleteProduct(id) {
  return tx([db.products], async () => {
    const p = await db.products.get(id);
    if (p) await write('products', { ...p, deleted: 1 });
  });
}

export function adjustStock(productId, qty, reason, note = '') {
  return tx([db.products, db.stock_movements], async () => {
    const p = await db.products.get(productId);
    if (!p) throw new Error('Product not found');
    return write('stock_movements', {
      productId, qty: Number(qty), reason, note, batchNumber: p.batchNumber || '',
    });
  });
}

/** Map productId -> current stock, from the ledger. */
export async function stockMap() {
  const map = new Map();
  await db.stock_movements.each((m) => {
    if (m.deleted) return;
    map.set(m.productId, (map.get(m.productId) || 0) + (Number(m.qty) || 0));
  });
  return map;
}

/** Find a product by any scanned code / SKU (exact match). */
export async function findProductByCode(codes) {
  for (const code of codes) {
    const byBarcode = await db.products.where('barcode').equals(code).filter((p) => !p.deleted).first();
    if (byBarcode) return byBarcode;
  }
  for (const code of codes) {
    const bySku = await db.products.where('sku').equalsIgnoreCase(code).filter((p) => !p.deleted).first();
    if (bySku) return bySku;
  }
  return null;
}

export async function searchProducts(query, limit = 20) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return db.products
    .filter((p) => !p.deleted && [p.name, p.sku, p.barcode, p.brand, p.batchNumber]
      .some((v) => String(v || '').toLowerCase().includes(q)))
    .limit(limit)
    .toArray();
}

/* ---------------------------------------------------------------- customers */

export function saveCustomer(customer) {
  return tx([db.customers], async () => write('customers', {
    ...customer,
    name: (customer.name || '').trim(),
    creditLimit: Number(customer.creditLimit) || 0,
    openingBalance: Number(customer.openingBalance) || 0,
  }));
}

export function deleteCustomer(id) {
  return tx([db.customers], async () => {
    const c = await db.customers.get(id);
    if (c) await write('customers', { ...c, deleted: 1 });
  });
}

/** Outstanding balance per customer: opening balance + unpaid issued invoices. */
export async function customerBalances() {
  const map = new Map();
  await db.customers.each((c) => { if (!c.deleted) map.set(c.id, Number(c.openingBalance) || 0); });
  await db.invoices.each((inv) => {
    if (inv.deleted || inv.status !== 'issued' || !inv.customerId) return;
    map.set(inv.customerId, (map.get(inv.customerId) || 0) + (inv.totals?.balance || 0));
  });
  return map;
}

/* ----------------------------------------------------------------- invoices */

/** Next number for this device: PREFIX-DEV-000001. Unique across offline devices. */
export async function nextInvoiceNumber() {
  const { invoicePrefix, deviceCode } = getSettings();
  const prefix = `${invoicePrefix || 'PL'}-${deviceCode}-`;
  const last = await db.invoices.where('number').startsWith(prefix).last();
  const lastSeq = last ? parseInt(last.number.slice(prefix.length), 10) || 0 : 0;
  return `${prefix}${String(lastSeq + 1).padStart(6, '0')}`;
}

export function newInvoiceDraft() {
  const s = getSettings();
  const date = todayISO();
  return {
    id: null,
    number: '',
    status: 'draft',
    date,
    dueDate: '',
    customerId: null,
    customer: null,
    items: [],
    discountType: 'amount',
    discountValue: 0,
    payments: [],
    notes: '',
    currency: s.currency,
    paymentTermsDays: s.paymentTermsDays,
  };
}

/** Rebuild the deterministic sale movements for an invoice. */
async function syncInvoiceMovements(invoice) {
  const existing = await db.stock_movements.where('invoiceId').equals(invoice.id).toArray();
  const wanted = new Map();
  if (invoice.status === 'issued' && !invoice.deleted) {
    for (const item of invoice.items) {
      if (!item.productId) continue;
      wanted.set(item.productId, (wanted.get(item.productId) || 0) + (Number(item.qty) || 0));
    }
  }
  for (const [productId, qty] of wanted) {
    const id = `sale:${invoice.id}:${productId}`;
    const cur = existing.find((m) => m.id === id);
    if (cur && !cur.deleted && cur.qty === -qty) continue; // unchanged
    await write('stock_movements', {
      ...(cur || {}),
      id,
      productId,
      invoiceId: invoice.id,
      qty: -qty,
      reason: 'sale',
      note: invoice.number,
      deleted: 0,
    });
  }
  for (const m of existing) {
    if (!m.deleted && !wanted.has(m.productId)) await write('stock_movements', { ...m, deleted: 1 });
  }
}

/**
 * Persist an invoice. `status`: 'draft' keeps stock untouched, 'issued'
 * deducts stock, 'void' returns it.
 */
export function saveInvoice(invoice, status = invoice.status || 'draft') {
  return tx([db.invoices, db.stock_movements, db.customers], async () => {
    const number = invoice.number || (await nextInvoiceNumber());
    const customer = invoice.customerId ? await db.customers.get(invoice.customerId) : null;
    const items = (invoice.items || []).filter((i) => Number(i.qty) > 0);
    const totals = computeTotals(items, invoice, invoice.payments || []);
    const saved = await write('invoices', {
      ...invoice,
      number,
      status,
      items,
      totals,
      // Snapshot so reprints stay correct even if the customer record changes later.
      customer: customer
        ? { name: customer.name, phone: customer.phone || '', email: customer.email || '',
          address: customer.address || '', taxId: customer.taxId || '', type: customer.type || '' }
        : invoice.customer || null,
      issuedAt: status === 'issued' ? invoice.issuedAt || Date.now() : invoice.issuedAt || null,
    });
    await syncInvoiceMovements(saved);
    return saved;
  });
}

export async function addPayment(invoiceId, payment) {
  const inv = await db.invoices.get(invoiceId);
  if (!inv) throw new Error('Invoice not found');
  const payments = [...(inv.payments || []), { id: uuid(), date: todayISO(), ...payment, amount: Number(payment.amount) || 0 }];
  return saveInvoice({ ...inv, payments }, inv.status);
}

export async function voidInvoice(invoiceId, reason = '') {
  const inv = await db.invoices.get(invoiceId);
  if (!inv) throw new Error('Invoice not found');
  return saveInvoice({ ...inv, voidReason: reason, voidedAt: Date.now() }, 'void');
}

export async function deleteDraft(invoiceId) {
  const inv = await db.invoices.get(invoiceId);
  if (!inv || inv.status !== 'draft') throw new Error('Only drafts can be deleted');
  return saveInvoice({ ...inv, deleted: 1 }, 'draft');
}

/* --------------------------------------------------------- backup / restore */

export async function exportBackup() {
  const out = { app: 'PureLab', version: 1, exportedAt: new Date().toISOString(), tables: {} };
  for (const t of ['products', 'customers', 'invoices', 'stock_movements']) {
    out.tables[t] = (await db[t].toArray()).map(({ _lseq, ...r }) => r);
  }
  return JSON.stringify(out, null, 2);
}

/** Merge a backup using the same LWW rule as sync (never clobbers newer data). */
export async function importBackup(json) {
  const data = JSON.parse(json);
  if (data.app !== 'PureLab' || !data.tables) throw new Error('Not a PureLab backup file');
  let count = 0;
  await tx([db.products, db.customers, db.invoices, db.stock_movements], async () => {
    for (const [table, rows] of Object.entries(data.tables)) {
      if (!db[table]) continue;
      for (const row of rows) {
        const local = await db[table].get(row.id);
        if (!local || isNewer(row, local)) {
          await db[table].put({ ...row, _lseq: await nextLseq() });
          count++;
        }
      }
    }
  });
  return count;
}
