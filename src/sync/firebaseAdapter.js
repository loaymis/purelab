/**
 * Sync adapter for Firebase Cloud Firestore.
 *
 * Collections pl_products / pl_customers / pl_invoices / pl_stock_movements hold
 *   { data: <full record>, updated_at, device_id, deleted, server_updated }
 *
 * - push: transactions of up to 100 records; each is written only if it is newer than
 *         the stored copy (last-write-wins). firestore.rules enforces the same rule.
 * - pull: ordered by server_updated (server commit time) + document id. The cursor is the
 *         exact {seconds, nanos, id} of the last document seen. The first page of every
 *         cycle re-reads a 60 s window before the cursor to cover commit-time skew —
 *         harmless, because merging is idempotent.
 */
import { getFirebase, getAccess } from './firebaseClient.js';
import { isNewer } from '../db/db.js';

const PAGE = 500;
const PUSH_CHUNK = 100;
const OVERLAP_SECONDS = 60;

const ACCESS_MESSAGES = {
  'signed-out': 'Not signed in to the cloud (Settings → Cloud)',
  unverified: 'Verify your email address to use cloud sync (Settings → Cloud)',
  'no-owner': 'Cloud has no owner yet — claim ownership in Settings → Cloud',
  pending: 'Waiting for the owner to approve this account (Settings → Team)',
};

export class FirebaseAdapter {
  constructor(config) {
    this.config = config;
    this.id = `firebase:${config.projectId}`;
    this.label = 'Cloud';
    this.fb = null;
    this.overlapDone = new Set();
  }

  async ready() {
    this.fb = await getFirebase(this.config);
    const access = await getAccess(this.fb);
    if (access.state !== 'owner' && access.state !== 'staff') {
      throw new Error(ACCESS_MESSAGES[access.state] || 'No cloud access');
    }
  }

  col(table) {
    return this.fb.fs.collection(this.fb.db, `pl_${table}`);
  }

  toDoc(row) {
    return {
      data: row,
      updated_at: Math.trunc(Number(row.updated_at) || 0),
      device_id: String(row.device_id || ''),
      deleted: !!row.deleted,
      server_updated: this.fb.fs.serverTimestamp(),
    };
  }

  async push(table, rows) {
    const { doc, runTransaction } = this.fb.fs;
    let accepted = 0;
    for (let i = 0; i < rows.length; i += PUSH_CHUNK) {
      const chunk = rows.slice(i, i + PUSH_CHUNK);
      accepted += await runTransaction(this.fb.db, async (tx) => {
        const refs = chunk.map((r) => doc(this.col(table), r.id));
        const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
        let n = 0;
        chunk.forEach((row, k) => {
          const cur = snaps[k].exists() ? snaps[k].data() : null;
          if (cur && !isNewer(
            { updated_at: Math.trunc(Number(row.updated_at) || 0), device_id: String(row.device_id || '') },
            cur,
          )) return;
          tx.set(refs[k], this.toDoc(row));
          n++;
        });
        return n;
      });
    }
    return accepted;
  }

  /** @param {{s:number,n:number,id:string}|0} since */
  async pull(table, since) {
    const { query, orderBy, startAt, startAfter, limit, getDocs, documentId, Timestamp } = this.fb.fs;
    const cur = since && typeof since === 'object' ? since : null;
    let position;
    if (!cur) {
      position = startAt(new Timestamp(0, 0));
    } else if (!this.overlapDone.has(table)) {
      position = startAt(new Timestamp(Math.max(0, cur.s - OVERLAP_SECONDS), 0));
    } else {
      position = startAfter(new Timestamp(cur.s, cur.n), cur.id);
    }
    this.overlapDone.add(table);

    const snap = await getDocs(query(
      this.col(table), orderBy('server_updated'), orderBy(documentId()), position, limit(PAGE),
    ));
    const docs = snap.docs.filter((d) => d.get('server_updated'));
    const rows = docs.map((d) => d.get('data')).filter((r) => r && r.id);
    let cursor = cur || 0;
    if (docs.length) {
      const last = docs[docs.length - 1];
      const ts = last.get('server_updated');
      const next = { s: ts.seconds, n: ts.nanoseconds, id: last.id };
      // Never move the cursor backwards (the overlap window starts before it).
      if (!cur || next.s > cur.s || (next.s === cur.s && (next.n > cur.n || (next.n === cur.n && next.id > cur.id)))) {
        cursor = next;
      }
    }
    return { rows, cursor, hasMore: snap.docs.length === PAGE };
  }
}
