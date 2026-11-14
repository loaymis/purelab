/**
 * PureLab Hub Store — SQLite (via sql.js / WebAssembly) persisted to disk.
 *
 * The desktop hub is the LAN "source of truth" that phones/tablets and the
 * desktop UI itself sync against. Every record carries:
 *   - updated_at  (ms epoch, set by the writing device)
 *   - device_id   (tie-breaker for identical timestamps)
 *   - seq         (hub-assigned, strictly increasing -> reliable pull cursor)
 *
 * Merge rule (identical on hub, Supabase and clients): last-write-wins, where
 * "newer" = higher updated_at, or same updated_at and lexicographically higher
 * device_id. This makes every replica converge to the same state.
 *
 * sql.js is used instead of a native SQLite binding so the installer never
 * needs a node-gyp / electron-rebuild step on Windows.
 */
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const SYNC_TABLES = ['products', 'customers', 'invoices', 'stock_movements'];

function resolveWasm(file) {
  // In a packaged app the wasm lives in app.asar.unpacked (see "asarUnpack").
  const p = require.resolve(`sql.js/dist/${file}`);
  return p.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
}

class HubStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.db = null;
    this.saveTimer = null;
    this.dirty = false;
  }

  async open() {
    const SQL = await initSqlJs({ locateFile: resolveWasm });
    if (fs.existsSync(this.filePath)) {
      this.db = new SQL.Database(fs.readFileSync(this.filePath));
    } else {
      this.db = new SQL.Database();
    }
    this.db.run(`
      CREATE TABLE IF NOT EXISTS records (
        tbl        TEXT    NOT NULL,
        id         TEXT    NOT NULL,
        data       TEXT    NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted    INTEGER NOT NULL DEFAULT 0,
        device_id  TEXT,
        seq        INTEGER NOT NULL,
        PRIMARY KEY (tbl, id)
      );
      CREATE INDEX IF NOT EXISTS idx_records_seq ON records (tbl, seq);
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
    `);
    this.persistNow();
    return this;
  }

  nextSeq() {
    const row = this.getOne(`SELECT value FROM meta WHERE key = 'seq'`);
    const next = (row ? Number(row.value) : 0) + 1;
    this.db.run(`INSERT INTO meta (key, value) VALUES ('seq', ?)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [String(next)]);
    return next;
  }

  getOne(sql, params = []) {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params);
      return stmt.step() ? stmt.getAsObject() : null;
    } finally {
      stmt.free();
    }
  }

  static isNewer(incoming, existing) {
    if (incoming.updated_at !== existing.updated_at) return incoming.updated_at > existing.updated_at;
    return String(incoming.device_id || '') > String(existing.device_id || '');
  }

  /** Apply a batch of records with LWW semantics. Returns number accepted. */
  push(table, rows) {
    if (!SYNC_TABLES.includes(table)) throw new Error(`Unknown table: ${table}`);
    if (!Array.isArray(rows)) throw new Error('rows must be an array');
    let accepted = 0;
    this.db.run('BEGIN');
    try {
      for (const row of rows) {
        if (!row || typeof row.id !== 'string' || !Number.isFinite(row.updated_at)) continue;
        const existing = this.getOne(
          'SELECT updated_at, device_id FROM records WHERE tbl = ? AND id = ?', [table, row.id]);
        if (existing && !HubStore.isNewer(row, existing)) continue;
        this.db.run(
          `INSERT INTO records (tbl, id, data, updated_at, deleted, device_id, seq)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(tbl, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at,
             deleted = excluded.deleted, device_id = excluded.device_id, seq = excluded.seq`,
          [table, row.id, JSON.stringify(row), row.updated_at, row.deleted ? 1 : 0,
            row.device_id || null, this.nextSeq()]);
        accepted++;
      }
      this.db.run('COMMIT');
    } catch (err) {
      this.db.run('ROLLBACK');
      throw err;
    }
    if (accepted) this.scheduleSave();
    return accepted;
  }

  /** Return records changed after `since` (hub seq cursor), oldest first. */
  pull(table, since = 0, limit = 500) {
    if (!SYNC_TABLES.includes(table)) throw new Error(`Unknown table: ${table}`);
    const cap = Math.max(1, Math.min(Number(limit) || 500, 2000));
    const stmt = this.db.prepare(
      'SELECT data, seq FROM records WHERE tbl = ? AND seq > ? ORDER BY seq ASC LIMIT ?');
    const rows = [];
    let cursor = Number(since) || 0;
    try {
      stmt.bind([table, cursor, cap + 1]);
      while (stmt.step()) {
        const r = stmt.getAsObject();
        rows.push({ data: JSON.parse(r.data), seq: r.seq });
      }
    } finally {
      stmt.free();
    }
    const hasMore = rows.length > cap;
    const page = rows.slice(0, cap);
    if (page.length) cursor = page[page.length - 1].seq;
    return { rows: page.map((r) => r.data), cursor, hasMore };
  }

  stats() {
    const out = {};
    for (const t of SYNC_TABLES) {
      const r = this.getOne('SELECT COUNT(*) AS n FROM records WHERE tbl = ? AND deleted = 0', [t]);
      out[t] = r ? r.n : 0;
    }
    return out;
  }

  scheduleSave() {
    this.dirty = true;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.persistNow(), 750);
  }

  /** Atomic write: temp file + rename, so a crash never corrupts the DB. */
  persistNow() {
    if (!this.db) return;
    clearTimeout(this.saveTimer);
    const tmp = `${this.filePath}.tmp`;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(tmp, Buffer.from(this.db.export()));
    fs.renameSync(tmp, this.filePath);
    this.dirty = false;
  }

  close() {
    if (this.dirty) this.persistNow();
    if (this.db) this.db.close();
    this.db = null;
  }
}

module.exports = { HubStore, SYNC_TABLES };
