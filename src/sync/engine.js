/**
 * Sync engine — local-first, multi-remote, last-write-wins.
 *
 * Remotes (any combination):
 *   • Desktop LAN hub  — works with no internet at all.
 *   • Supabase cloud   — used whenever the internet is reachable.
 * A desktop configured with both acts as a bridge: phone → hub → cloud.
 *
 * For each remote and table:
 *   1. PUSH  local records whose _lseq > that remote's push cursor.
 *   2. PULL  remote records whose server cursor > our pull cursor, and merge
 *            them locally with the shared LWW rule (isNewer).
 * Cursors live in IndexedDB (sync_state), so sync resumes after restarts.
 */
import { db, SYNC_TABLES, toWire, isNewer, nextLseq, getState, setState } from '../db/db.js';
import { onLocalChange } from '../db/repo.js';
import { getSettings, subscribeSettings } from '../lib/settings.js';
import { desktop } from '../lib/platform.js';
import { HubAdapter } from './hubAdapter.js';
import { SupabaseAdapter } from './supabaseAdapter.js';

const PUSH_BATCH = 200;

class SyncEngine {
  constructor() {
    this.listeners = new Set();
    this.running = null;
    this.timer = null;
    this.debounce = null;
    this.rerun = false;
    this.desktopHub = null; // {url, token} discovered from Electron
    this.status = {
      online: typeof navigator === 'undefined' ? true : navigator.onLine,
      syncing: false,
      lastSyncAt: null,
      remotes: {}, // id -> { label, ok, error, lastSyncAt, pending }
    };
  }

  /* ------------------------------------------------------------ public */

  subscribe(fn) {
    this.listeners.add(fn);
    fn(this.status);
    return () => this.listeners.delete(fn);
  }

  getStatus() {
    return this.status;
  }

  async start() {
    if (desktop) {
      try {
        const info = await desktop.getHubInfo();
        if (info.running && info.localUrl) this.desktopHub = { url: info.localUrl, token: info.token };
      } catch (err) {
        console.warn('Hub info unavailable', err);
      }
    }
    window.addEventListener('online', () => { this.set({ online: true }); this.syncSoon(500); });
    window.addEventListener('offline', () => this.set({ online: false }));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.syncSoon(500);
    });
    onLocalChange(() => this.syncSoon(2500));
    subscribeSettings(() => this.schedule());
    this.schedule();
    await this.refreshPending();
    this.syncSoon(1000);
  }

  /** Re-read hub info (after the user toggles the hub or rotates its token). */
  async refreshDesktopHub() {
    if (!desktop) return;
    const info = await desktop.getHubInfo();
    this.desktopHub = info.running && info.localUrl ? { url: info.localUrl, token: info.token } : null;
    this.syncSoon(200);
  }

  syncSoon(ms = 2000) {
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => this.syncNow().catch(() => {}), ms);
  }

  /** Run one full sync cycle against every configured remote. */
  syncNow() {
    if (this.running) {
      // Changes made during a running cycle get a follow-up cycle right after.
      this.rerun = true;
      return this.running;
    }
    this.running = this.runCycle().finally(() => {
      this.running = null;
      if (this.rerun) {
        this.rerun = false;
        this.syncSoon(250);
      }
    });
    return this.running;
  }

  /* ----------------------------------------------------------- private */

  set(patch) {
    this.status = { ...this.status, ...patch };
    this.listeners.forEach((fn) => fn(this.status));
  }

  setRemote(id, patch) {
    const prev = this.status.remotes[id] || {};
    this.set({ remotes: { ...this.status.remotes, [id]: { ...prev, ...patch } } });
  }

  schedule() {
    clearInterval(this.timer);
    const { autoSync, intervalSec } = getSettings().sync;
    if (autoSync) this.timer = setInterval(() => this.syncNow().catch(() => {}), Math.max(15, intervalSec || 60) * 1000);
  }

  adapters() {
    const { sync } = getSettings();
    const list = [];
    if (this.desktopHub) list.push(new HubAdapter(this.desktopHub.url, this.desktopHub.token));
    else if (sync.hubUrl && sync.hubToken) list.push(new HubAdapter(sync.hubUrl, sync.hubToken));
    if (sync.supabaseUrl && sync.supabaseAnonKey) list.push(new SupabaseAdapter(sync.supabaseUrl, sync.supabaseAnonKey));
    return list;
  }

  async runCycle() {
    const adapters = this.adapters();
    // Drop status for remotes that are no longer configured.
    const keep = Object.fromEntries(Object.entries(this.status.remotes).filter(([id]) => adapters.some((a) => a.id === id)));
    this.set({ syncing: adapters.length > 0, remotes: keep });
    try {
      for (const adapter of adapters) {
        this.setRemote(adapter.id, { label: adapter.label, syncing: true });
        try {
          await adapter.ready();
          for (const table of SYNC_TABLES) {
            await this.pushTable(adapter, table);
            await this.pullTable(adapter, table);
          }
          this.setRemote(adapter.id, { ok: true, error: null, lastSyncAt: Date.now(), syncing: false });
        } catch (err) {
          this.setRemote(adapter.id, { ok: false, error: err.message || String(err), syncing: false });
        }
      }
      if (adapters.length) this.set({ lastSyncAt: Date.now() });
    } finally {
      this.set({ syncing: false });
      await this.refreshPending();
    }
  }

  async pushTable(adapter, table) {
    const key = `push:${adapter.id}:${table}`;
    let cursor = await getState(key, 0);
    for (;;) {
      const rows = await db[table].where('_lseq').above(cursor).limit(PUSH_BATCH).sortBy('_lseq');
      if (!rows.length) break;
      await adapter.push(table, rows.map(toWire));
      cursor = rows[rows.length - 1]._lseq;
      await setState(key, cursor);
      if (rows.length < PUSH_BATCH) break;
    }
  }

  async pullTable(adapter, table) {
    const key = `pull:${adapter.id}:${table}`;
    let cursor = await getState(key, 0);
    for (;;) {
      const page = await adapter.pull(table, cursor);
      if (page.rows.length) await this.merge(table, page.rows, `push:${adapter.id}:${table}`);
      cursor = page.cursor;
      await setState(key, cursor);
      if (!page.hasMore) break;
    }
  }

  /** Apply remote rows locally if they win LWW. Accepted rows get a new _lseq so
   *  they are forwarded to the *other* remotes (hub ⇄ cloud bridging). If this
   *  remote had nothing pending, its push cursor skips past the merged rows so
   *  they are not echoed straight back to where they came from. */
  async merge(table, rows, pushKey) {
    let changed = 0;
    await db.transaction('rw', db[table], db.sync_state, async () => {
      const lseqBefore = await getState('lseq', 0);
      const pushCursor = await getState(pushKey, 0);
      const nothingPending = (await db[table].where('_lseq').above(pushCursor).count()) === 0;
      for (const row of rows) {
        if (!row || !row.id) continue;
        const local = await db[table].get(row.id);
        if (local && !isNewer(row, local)) continue;
        await db[table].put({ ...row, _lseq: await nextLseq() });
        changed++;
      }
      if (changed && nothingPending && pushCursor <= lseqBefore) {
        await setState(pushKey, await getState('lseq', 0));
      }
    });
    return changed;
  }

  async refreshPending() {
    const adapters = this.adapters();
    for (const adapter of adapters) {
      let pending = 0;
      for (const table of SYNC_TABLES) {
        const cursor = await getState(`push:${adapter.id}:${table}`, 0);
        pending += await db[table].where('_lseq').above(cursor).count();
      }
      this.setRemote(adapter.id, { label: adapter.label, pending });
    }
  }
}

export const syncEngine = new SyncEngine();
