/**
 * Local-first database (IndexedDB via Dexie). Works identically in Electron,
 * desktop browsers and mobile browsers, and survives being offline.
 *
 * Sync metadata on every synced record:
 *   updated_at : ms epoch of last local/remote write (LWW clock)
 *   device_id  : writer device (deterministic LWW tie-break)
 *   deleted    : 0 | 1 soft-delete tombstone (deletes must sync too)
 *   _lseq      : local change sequence. Each remote keeps its own push cursor
 *                over _lseq, so one change can be pushed to the LAN hub AND to
 *                the cloud independently. Never sent over the wire.
 */
import Dexie from 'dexie';

export const SYNC_TABLES = ['products', 'customers', 'invoices', 'stock_movements'];

export const db = new Dexie('purelab');

db.version(1).stores({
  products: 'id, sku, barcode, name, category, deleted, _lseq',
  customers: 'id, name, phone, deleted, _lseq',
  invoices: 'id, number, customerId, date, status, deleted, _lseq',
  stock_movements: 'id, productId, invoiceId, deleted, _lseq',
  sync_state: 'key',
});

/** Strip local-only fields before sending a record to a remote. */
export function toWire(record) {
  const { _lseq, ...rest } = record;
  return rest;
}

/** LWW comparison shared with the desktop hub and the Firestore security rules. */
export function isNewer(a, b) {
  if (!b) return true;
  if (a.updated_at !== b.updated_at) return a.updated_at > b.updated_at;
  return String(a.device_id || '') > String(b.device_id || '');
}

/** Allocate the next local change sequence (must run inside a rw tx incl. sync_state). */
export async function nextLseq() {
  const row = await db.sync_state.get('lseq');
  const next = (row?.value || 0) + 1;
  await db.sync_state.put({ key: 'lseq', value: next });
  return next;
}

export async function getState(key, fallback = null) {
  const row = await db.sync_state.get(key);
  return row ? row.value : fallback;
}

export async function setState(key, value) {
  await db.sync_state.put({ key, value });
}
