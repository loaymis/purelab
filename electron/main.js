/**
 * PureLab — Electron main process.
 *
 * Responsibilities:
 *  - Create the secure application window (contextIsolation + sandbox).
 *  - Grant camera access for the barcode scanner.
 *  - Run the LAN Hub (SQLite store + HTTP/HTTPS sync server) so mobile devices
 *    can use PureLab and sync with this desktop while fully offline from the internet.
 *  - Print / export invoices to PDF (A4 or 80mm thermal) through IPC.
 */
const { app, BrowserWindow, ipcMain, dialog, shell, session, Menu } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { HubStore } = require('./hub/store');
const { HubServer } = require('./hub/server');

const isDev = !!process.env.VITE_DEV_SERVER_URL;
const DIST_DIR = path.join(__dirname, '..', 'dist');
const ICON = path.join(__dirname, '..', 'build', 'icon.png');

let mainWindow = null;
let hubStore = null;
let hubServer = null;
const exportedFiles = new Set(); // only files we wrote may be opened via IPC

/* ------------------------------------------------------------------ config */

const configPath = () => path.join(app.getPath('userData'), 'purelab-config.json');

function loadConfig() {
  const defaults = {
    hubEnabled: true,
    httpPort: 4545,
    httpsPort: 4546,
    hubToken: crypto.randomBytes(18).toString('base64url'),
  };
  try {
    const saved = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    return { ...defaults, ...saved };
  } catch {
    saveConfig(defaults);
    return defaults;
  }
}

function saveConfig(cfg) {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

let config = null;

/* --------------------------------------------------------------------- hub */

async function startHub() {
  if (!hubStore) {
    hubStore = await new HubStore(path.join(app.getPath('userData'), 'purelab-hub.sqlite')).open();
  }
  if (!config.hubEnabled) return;
  hubServer = new HubServer({
    store: hubStore,
    staticDir: DIST_DIR,
    dataDir: app.getPath('userData'),
    getToken: () => config.hubToken,
    httpPort: config.httpPort,
    httpsPort: config.httpsPort,
    version: app.getVersion(),
  });
  const info = await hubServer.start();
  if (info.errors.length) console.warn('[hub]', info.errors.join('; '));
}

async function stopHub() {
  if (hubServer) await hubServer.stop();
  hubServer = null;
}

function hubInfo() {
  const base = hubServer
    ? hubServer.info()
    : { running: false, httpPort: null, httpsPort: null, addresses: [], lanUrls: [], localUrl: null, errors: [] };
  return { ...base, enabled: config.hubEnabled, token: config.hubToken, stats: hubStore ? hubStore.stats() : {} };
}

/* ------------------------------------------------------------------ window */

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 380,
    minHeight: 600,
    title: 'PureLab',
    icon: ICON,
    backgroundColor: '#f8fafc',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // External links open in the system browser; never spawn new Electron windows.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // http(s) (incl. WhatsApp wa.me links) and mailto: open in the system apps.
    if (/^(https?:\/\/|mailto:)/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = isDev ? url.startsWith(process.env.VITE_DEV_SERVER_URL) : url.startsWith('file://');
    if (!allowed) event.preventDefault();
  });

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(DIST_DIR, 'index.html'));
  }
  mainWindow.on('closed', () => { mainWindow = null; });
}

function buildMenu() {
  const template = [
    { label: 'File', submenu: [{ role: 'quit', label: 'Exit PureLab' }] },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [{
        label: 'About PureLab',
        click: () => dialog.showMessageBox({
          type: 'info', title: 'About PureLab', icon: ICON,
          message: `PureLab POS v${app.getVersion()}`,
          detail: 'Offline-first invoicing & point of sale for pharmaceutical and dermo-cosmetic sales.',
        }),
      }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* --------------------------------------------------------------------- IPC */

function registerIpc() {
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    userData: app.getPath('userData'),
  }));

  ipcMain.handle('hub:info', () => hubInfo());

  ipcMain.handle('hub:regenerate-token', () => {
    config.hubToken = crypto.randomBytes(18).toString('base64url');
    saveConfig(config);
    return hubInfo();
  });

  ipcMain.handle('hub:set-enabled', async (_e, enabled) => {
    config.hubEnabled = !!enabled;
    saveConfig(config);
    await stopHub();
    if (config.hubEnabled) await startHub();
    return hubInfo();
  });

  // Save the currently rendered print layout (see src/lib/print.js) as a PDF.
  ipcMain.handle('print:pdf', async (event, opts = {}) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const safeName = String(opts.fileName || 'invoice.pdf').replace(/[\\/:*?"<>|]+/g, '-');
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Save invoice as PDF',
      defaultPath: path.join(app.getPath('documents'), safeName),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (canceled || !filePath) return { saved: false };
    const pdf = await event.sender.printToPDF({
      printBackground: true,
      preferCSSPageSize: true, // honour the @page size injected by the renderer
      pageSize: opts.pageSize || 'A4',
      margins: { marginType: 'none' },
    });
    fs.writeFileSync(filePath, pdf);
    exportedFiles.add(filePath);
    return { saved: true, filePath };
  });

  // Send to a physical printer (thermal or laser) using the OS print dialog.
  ipcMain.handle('print:direct', (event, opts = {}) => new Promise((resolve) => {
    event.sender.print(
      { silent: !!opts.silent, printBackground: true, deviceName: opts.deviceName || undefined },
      (success, failureReason) => resolve({ success, failureReason: failureReason || null }),
    );
  }));

  ipcMain.handle('file:open', async (_e, filePath) => {
    if (!exportedFiles.has(filePath)) return { opened: false };
    const err = await shell.openPath(filePath);
    return { opened: !err, error: err || null };
  });

  ipcMain.handle('backup:save', async (event, { json, fileName }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Export PureLab backup',
      defaultPath: path.join(app.getPath('documents'), fileName || 'purelab-backup.json'),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || !filePath) return { saved: false };
    fs.writeFileSync(filePath, json, 'utf8');
    return { saved: true, filePath };
  });
}

/* --------------------------------------------------------------- lifecycle */

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId('com.purelab.pos');
    config = loadConfig();

    // Camera for the barcode scanner; deny everything else by default.
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback, details) => {
      if (permission === 'media') {
        const types = details.mediaTypes || [];
        return callback(types.every((t) => t === 'video'));
      }
      callback(permission === 'clipboard-sanitized-write');
    });
    session.defaultSession.setPermissionCheckHandler((_wc, permission) =>
      permission === 'media' || permission === 'clipboard-sanitized-write');

    registerIpc();
    buildMenu();
    try {
      await startHub();
    } catch (err) {
      console.error('[hub] failed to start', err);
    }
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    // Flush SQLite synchronously first — the process may exit before async work finishes.
    try {
      if (hubServer) hubServer.stop();
      if (hubStore) hubStore.close();
      hubStore = null;
    } catch (err) {
      console.error('[hub] shutdown error', err);
    }
  });
}
