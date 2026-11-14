/**
 * PureLab LAN Hub server.
 *
 *  - Serves the built web app (dist/) so phones & tablets on the same Wi-Fi
 *    can open PureLab in their browser (the "mobile companion").
 *  - Exposes a token-protected sync API backed by the SQLite HubStore.
 *  - Runs HTTP (port 4545) and HTTPS (port 4546, self-signed). Mobile browsers
 *    only allow camera access on secure origins, so phones should use HTTPS.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const selfsigned = require('selfsigned');

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

/** Load or create a self-signed certificate covering every current LAN IP. */
function loadCertificate(dir) {
  const certPath = path.join(dir, 'hub-cert.json');
  const ips = ['127.0.0.1', ...lanAddresses()];
  if (fs.existsSync(certPath)) {
    try {
      const saved = JSON.parse(fs.readFileSync(certPath, 'utf8'));
      const covered = ips.every((ip) => saved.ips.includes(ip));
      const fresh = Date.now() - saved.createdAt < 300 * 24 * 3600 * 1000;
      if (covered && fresh) return saved;
    } catch { /* regenerate below */ }
  }
  const pems = selfsigned.generate([{ name: 'commonName', value: 'PureLab Hub' }], {
    keySize: 2048,
    days: 365,
    algorithm: 'sha256',
    extensions: [
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      {
        name: 'subjectAltName',
        altNames: [{ type: 2, value: 'localhost' }, ...ips.map((ip) => ({ type: 7, ip }))],
      },
    ],
  });
  const saved = { key: pems.private, cert: pems.cert, ips, createdAt: Date.now() };
  fs.writeFileSync(certPath, JSON.stringify(saved), { mode: 0o600 });
  return saved;
}

function timingSafeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

class HubServer {
  /**
   * @param {object} opts
   * @param {import('./store').HubStore} opts.store
   * @param {string} opts.staticDir   built web app (dist/)
   * @param {string} opts.dataDir     where the TLS cert is kept
   * @param {() => string} opts.getToken
   * @param {number} opts.httpPort
   * @param {number} opts.httpsPort
   * @param {string} opts.version
   */
  constructor(opts) {
    this.opts = opts;
    this.httpServer = null;
    this.httpsServer = null;
    this.errors = [];
  }

  buildApp() {
    const { store, staticDir, getToken, version } = this.opts;
    const app = express();
    app.disable('x-powered-by');
    app.use(cors({ origin: true, allowedHeaders: ['Content-Type', 'Authorization', 'X-PureLab-Token'] }));
    app.use(express.json({ limit: '20mb' }));

    app.get('/api/health', (_req, res) => {
      res.json({ ok: true, name: 'PureLab Hub', version, time: Date.now() });
    });

    // Every /api/sync route requires the pairing token.
    app.use('/api/sync', (req, res, next) => {
      const header = req.get('x-purelab-token') || (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
      if (!header || !timingSafeEqual(header, getToken())) {
        return res.status(401).json({ error: 'Invalid or missing hub token. Re-pair this device.' });
      }
      next();
    });

    app.post('/api/sync/push', (req, res) => {
      try {
        const { table, rows } = req.body || {};
        res.json({ accepted: store.push(table, rows) });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });

    app.get('/api/sync/pull', (req, res) => {
      try {
        const { table, since, limit } = req.query;
        res.json(store.pull(String(table), Number(since) || 0, Number(limit) || 500));
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });

    app.get('/api/sync/stats', (_req, res) => res.json(store.stats()));

    if (staticDir && fs.existsSync(staticDir)) {
      app.use(express.static(staticDir, { index: 'index.html', maxAge: '1h' }));
      // Hash routing means every page is served from index.html.
      app.get('*', (_req, res) => res.sendFile(path.join(staticDir, 'index.html')));
    } else {
      app.get('/', (_req, res) => res.type('text').send('PureLab Hub is running. Build the web app (npm run build:web) to serve the mobile companion.'));
    }
    return app;
  }

  listen(server, port) {
    return new Promise((resolve) => {
      server.once('error', (err) => {
        this.errors.push(`Port ${port}: ${err.message}`);
        resolve(false);
      });
      server.listen(port, '0.0.0.0', () => resolve(true));
    });
  }

  async start() {
    this.errors = [];
    const app = this.buildApp();
    this.httpServer = http.createServer(app);
    const httpOk = await this.listen(this.httpServer, this.opts.httpPort);
    if (!httpOk) this.httpServer = null;

    try {
      const { key, cert } = loadCertificate(this.opts.dataDir);
      this.httpsServer = https.createServer({ key, cert }, app);
      const httpsOk = await this.listen(this.httpsServer, this.opts.httpsPort);
      if (!httpsOk) this.httpsServer = null;
    } catch (err) {
      this.errors.push(`HTTPS: ${err.message}`);
      this.httpsServer = null;
    }
    return this.info();
  }

  async stop() {
    const close = (s) => new Promise((r) => (s ? s.close(() => r()) : r()));
    await Promise.all([close(this.httpServer), close(this.httpsServer)]);
    this.httpServer = null;
    this.httpsServer = null;
  }

  info() {
    const ips = lanAddresses();
    const { httpPort, httpsPort } = this.opts;
    return {
      running: !!(this.httpServer || this.httpsServer),
      httpPort: this.httpServer ? httpPort : null,
      httpsPort: this.httpsServer ? httpsPort : null,
      addresses: ips,
      localUrl: this.httpServer ? `http://127.0.0.1:${httpPort}` : null,
      lanUrls: ips.flatMap((ip) => [
        ...(this.httpsServer ? [`https://${ip}:${httpsPort}`] : []),
        ...(this.httpServer ? [`http://${ip}:${httpPort}`] : []),
      ]),
      errors: this.errors,
    };
  }
}

module.exports = { HubServer, lanAddresses };
