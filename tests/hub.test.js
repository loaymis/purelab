import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { HubStore } = require('../electron/hub/store.js');
const { HubServer } = require('../electron/hub/server.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'purelab-hub-'));

test('hub store: last-write-wins, cursors, persistence', async () => {
  const file = path.join(tmp, 'hub.sqlite');
  const store = await new HubStore(file).open();
  assert.equal(store.push('products', [{ id: 'p1', name: 'A', updated_at: 100, device_id: 'x' }]), 1);
  // Older write is rejected
  assert.equal(store.push('products', [{ id: 'p1', name: 'stale', updated_at: 50, device_id: 'x' }]), 0);
  // Equal timestamp: higher device_id wins deterministically
  assert.equal(store.push('products', [{ id: 'p1', name: 'B', updated_at: 100, device_id: 'y' }]), 1);
  assert.equal(store.push('products', [{ id: 'p1', name: 'C', updated_at: 100, device_id: 'a' }]), 0);
  const page = store.pull('products', 0);
  assert.equal(page.rows.length, 1);
  assert.equal(page.rows[0].name, 'B');
  assert.equal(store.pull('products', page.cursor).rows.length, 0);
  store.close();
  const reopened = await new HubStore(file).open();
  assert.equal(reopened.pull('products', 0).rows[0].name, 'B');
  reopened.close();
});

test('hub server: token auth + push/pull over HTTP', async () => {
  const store = await new HubStore(path.join(tmp, 'srv.sqlite')).open();
  const server = new HubServer({
    store, staticDir: null, dataDir: tmp, getToken: () => 'secret', httpPort: 45450, httpsPort: 45460, version: 'test',
  });
  const info = await server.start();
  assert.ok(info.running);
  try {
    const base = 'http://127.0.0.1:45450';
    const denied = await fetch(`${base}/api/sync/pull?table=products`);
    assert.equal(denied.status, 401);
    const h = { 'Content-Type': 'application/json', 'X-PureLab-Token': 'secret' };
    const push = await fetch(`${base}/api/sync/push`, { method: 'POST', headers: h,
      body: JSON.stringify({ table: 'customers', rows: [{ id: 'c1', name: 'Clinic', updated_at: 1, device_id: 'd' }] }) });
    assert.deepEqual(await push.json(), { accepted: 1 });
    const pull = await (await fetch(`${base}/api/sync/pull?table=customers&since=0`, { headers: h })).json();
    assert.equal(pull.rows[0].name, 'Clinic');
    const https = await fetch(`https://127.0.0.1:45460/api/health`).catch((e) => e);
    assert.ok(https instanceof Error); // self-signed cert is untrusted by default — expected
  } finally {
    await server.stop();
    store.close();
  }
});
