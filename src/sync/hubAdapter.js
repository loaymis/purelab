/**
 * Sync adapter for the PureLab desktop LAN hub (electron/hub/server.js).
 */
const TIMEOUT_MS = 15000;

export class HubAdapter {
  constructor(baseUrl, token) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = token;
    this.id = `hub:${this.baseUrl}`;
    this.label = 'Desktop hub';
  }

  async request(path, init = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'X-PureLab-Token': this.token, ...(init.headers || {}) },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Hub responded ${res.status}`);
      return body;
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('Hub did not respond (timeout)');
      if (err instanceof TypeError) throw new Error('Hub unreachable — check Wi-Fi and that PureLab desktop is running');
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async ready() {
    await this.request('/api/health');
  }

  async push(table, rows) {
    const { accepted } = await this.request('/api/sync/push', {
      method: 'POST',
      body: JSON.stringify({ table, rows }),
    });
    return accepted;
  }

  /** @returns {Promise<{rows: object[], cursor: number, hasMore: boolean}>} */
  async pull(table, since) {
    const q = new URLSearchParams({ table, since: String(since || 0), limit: '500' });
    return this.request(`/api/sync/pull?${q}`);
  }
}
