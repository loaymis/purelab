/**
 * Stock lots & expiry (first-expiry-first-out).
 *
 * Every stock receipt (opening stock, purchase/restock, customer return, positive count
 * correction) is a lot with its own expiry date. Stock leaving (sales, damage, negative
 * corrections) is taken from the earliest-expiring lots first — how pharmacies rotate
 * stock. The product's displayed expiry is the earliest expiry still on the shelf.
 *
 * Pure functions; works on the stock_movements ledger kept by src/db/repo.js.
 */

/**
 * @param {Array<{qty:number, expiryDate?:string, deleted?:number}>} movements one product's ledger
 * @param {string} [fallbackExpiry] product.expiryDate, used for lots recorded without one
 * @returns {Array<{qty:number, expiryDate:string|null}>} remaining lots, earliest expiry first
 */
export function lotsFor(movements, fallbackExpiry = '') {
  const live = movements.filter((m) => !m.deleted && Number(m.qty));
  const lots = live
    .filter((m) => Number(m.qty) > 0)
    .map((m) => ({ qty: Number(m.qty), expiryDate: m.expiryDate || fallbackExpiry || null }));
  // Undated lots go last: dated stock is what needs to leave first.
  lots.sort((a, b) => (a.expiryDate || '9999').localeCompare(b.expiryDate || '9999'));

  let out = live.filter((m) => Number(m.qty) < 0).reduce((s, m) => s - Number(m.qty), 0);
  for (const lot of lots) {
    if (out <= 0) break;
    const take = Math.min(lot.qty, out);
    lot.qty -= take;
    out -= take;
  }
  // Merge lots that share an expiry date.
  const merged = new Map();
  for (const lot of lots) {
    if (lot.qty <= 0) continue;
    const k = lot.expiryDate || '';
    merged.set(k, (merged.get(k) || 0) + lot.qty);
  }
  return [...merged.entries()]
    .map(([expiryDate, qty]) => ({ qty, expiryDate: expiryDate || null }))
    .sort((a, b) => (a.expiryDate || '9999').localeCompare(b.expiryDate || '9999'));
}

/** Earliest expiry still in stock (or the product's own expiry when nothing is left). */
export function currentExpiry(movements, fallbackExpiry = '') {
  const first = lotsFor(movements, fallbackExpiry).find((l) => l.expiryDate);
  return first ? first.expiryDate : fallbackExpiry || null;
}

/** Movement needed to set stock to an exact count (0 when nothing changes). */
export function correctionFor(current, target) {
  const t = Number(target);
  if (!Number.isFinite(t)) return 0;
  return Math.round((t - Number(current || 0)) * 1000) / 1000;
}
