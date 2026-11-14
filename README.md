# PureLab POS

Offline-first invoicing and point-of-sale software for pharmaceutical and dermo-cosmetic sales, built for Windows. It runs as an Electron desktop app, and phones or tablets can use it from a browser.

- **Invoices and POS:** branded A4 tax invoices and 80 mm thermal receipts. Totals are calculated automatically, including line and invoice discounts, mixed VAT rates, split payments, change due and balances. You can print or save to PDF.
- **Camera barcode scanner:** EAN/UPC, Code 128/39, ITF, QR, and the **GS1 DataMatrix** on medicine packs (PureLab reads the GTIN, batch and expiry from it). It also works with USB keyboard-wedge scanners and with manual SKU or name search.
- **Offline first:** every device keeps its own data in IndexedDB and works with no network.
- **Desktop hub (LAN):** the desktop app runs a SQLite-backed sync server and serves the app to phones on the same Wi-Fi. Pairing is done by QR code, and no internet is needed.
- **Cloud sync (Supabase):** used automatically whenever a device is online. A desktop connected to both the hub and the cloud passes data between them (phone → hub → cloud).
- **Inventory:** batches, expiry dates, reorder levels, and a stock ledger that never loses entries (adjustments, receipts, damaged or expired stock). Stock is deducted when an invoice is issued, and returned when an invoice is voided or edited.
- **Customers:** pharmacies, clinics and retail customers, with credit limits, opening balances, live outstanding balances and purchase history.

## Download

**[Download PureLab for Windows](https://github.com/loaymis/purelab/releases/latest/download/PureLab-Setup.exe)**: a one-click installer. Double-click it and PureLab installs, creates desktop and Start-menu shortcuts, and opens.

> The link always serves the newest release, and anyone can use it without a GitHub account. All versions are listed on the [Releases page](https://github.com/loaymis/purelab/releases).
> The installer is not code-signed yet. If Windows shows "Windows protected your PC", choose **More info → Run anyway**.

### Publishing a new version
1. Change `"version"` in `package.json`, for example to `1.0.1`, and commit.
2. Push to `main` with `git push`. Pushes that only change Markdown files (such as this README) don't trigger a build.
3. GitHub Actions (`.github/workflows/release.yml`) builds the installer on Windows and publishes it as release `v1.0.1`. The download link above then serves the new version.
   If you push without changing the version, the installer in the current release is rebuilt and replaced. You can also start a build manually from the **Actions** tab with **Run workflow**.

---

## 1. Project structure

```
purelab/
├── package.json              # scripts + electron-builder (Windows NSIS) config
├── vite.config.js            # React build (base './' so it loads from file:// and the hub)
├── tailwind.config.js        # PureLab brand palette
├── index.html                # app shell + CSP
├── build/icon.png            # app/installer icon (electron-builder converts to .ico)
├── public/                   # PWA manifest, icons, service worker (offline shell for mobile)
├── electron/
│   ├── main.js               # main process: window, camera permission, IPC, print/PDF, hub lifecycle
│   ├── preload.js            # window.purelab bridge (contextIsolation, sandbox)
│   └── hub/
│       ├── store.js          # SQLite (sql.js/WASM) store with last-write-wins merge + seq cursors
│       └── server.js         # Express HTTP :4545 + HTTPS :4546 (self-signed) — serves app + sync API
├── src/
│   ├── main.jsx, App.jsx     # entry + routes (HashRouter)
│   ├── index.css             # Tailwind + print rules
│   ├── db/
│   │   ├── db.js             # Dexie (IndexedDB) schema + sync metadata helpers
│   │   ├── repo.js           # all business writes: products, stock ledger, customers, invoices, backup
│   │   └── hooks.js          # live React queries
│   ├── sync/
│   │   ├── engine.js         # multi-remote push/pull sync engine
│   │   ├── hubAdapter.js     # LAN hub adapter
│   │   └── supabaseAdapter.js# Supabase adapter (RPC push + server_seq pull)
│   ├── lib/
│   │   ├── calc.js           # invoice math (pure, unit-tested)
│   │   ├── barcode.js        # GS1 parsing + EAN/UPC/GTIN candidate matching
│   │   ├── print.js          # A4 / thermal @page sizing, print + PDF (Electron & browser)
│   │   ├── settings.js       # per-device settings (company, invoicing, sync)
│   │   ├── format.js, ids.js, platform.js, demo.js
│   ├── components/
│   │   ├── Layout.jsx        # sidebar (desktop) / bottom tab bar (mobile)
│   │   ├── BarcodeScanner.jsx# live camera scanner (html5-qrcode + native BarcodeDetector)
│   │   ├── ProductPicker.jsx # search + USB scanner + camera scan → line items
│   │   ├── InvoiceDocument.jsx # A4 invoice + 80mm receipt + print portal
│   │   ├── SyncIndicator.jsx, ui.jsx
│   └── pages/
│       ├── Dashboard.jsx, InvoiceEditor.jsx (POS), InvoiceView.jsx, Invoices.jsx
│       ├── Products.jsx, Customers.jsx, CustomerDetail.jsx, Settings.jsx, Pair.jsx
├── supabase/schema.sql       # cloud tables, RLS, purelab_push() LWW merge function
└── tests/                    # node:test — invoice math, GS1, hub store/server
```

---

## 2. Setup and development

Requirements: **Node.js 20 or newer** (22 LTS recommended) and Windows 10/11. macOS and Linux also work for development.

```bash
npm install
```

Start the app in development mode (Vite with hot reload, plus Electron):

```bash
npm run dev
```

Run the unit tests:

```bash
npm test
```

Run it as a web app only, for example to try it from a phone during development:

```bash
npm run dev:web
```

On first launch, go to **Settings → Data → Load demo data** to add 10 sample products and 3 customers. Then open **New Sale** and type `6291100100017` and press Enter, or scan with the camera.

Keyboard shortcuts in the POS: **F2** jumps to search, **F8** saves a draft, **F9** issues the invoice and prints it.

---

## 3. Building the Windows installer (.exe)

On a Windows machine:

```bash
npm run dist:win
```

This builds the React app into `dist/` and then runs `electron-builder --win --x64`. The output is:

- `release/PureLab-Setup-1.0.0.exe`: an NSIS installer that lets the user pick the install folder and creates desktop and Start-menu shortcuts.
- `release/win-unpacked/PureLab.exe`: a portable build that runs without installing.

Notes:
- You can build on Linux or macOS too, but electron-builder needs **wine** for the final Windows resource step. The simplest option is to build on Windows or in a Windows CI runner.
- To sign the installer, set `CSC_LINK` (path to your .pfx file) and `CSC_KEY_PASSWORD` before running `dist:win`. Without signing, Windows SmartScreen will warn users the first time they run it.
- To test a production build without packaging it, run `npm start`.

---

## 4. Mobile companion (desktop hub, LAN)

The desktop app automatically starts a hub on **HTTP :4545** and **HTTPS :4546**.

1. On the desktop, open **Settings → Desktop hub**. It shows a QR code, and you can choose which network address it points to. Pick an `https://` address so the phone's camera will work.
2. On the phone, connect to the same Wi-Fi, then scan the QR code with the normal camera app and open the link.
3. The browser warns once about the self-signed certificate (it is local only). Accept it. The phone then pairs and downloads the data.
4. Optionally, use **Share → Add to Home Screen** so it opens like an app.
5. If Windows Firewall asks, allow PureLab on **private networks**.

Phones keep working when the hub is out of reach, because sales are saved on the phone. They sync the next time the hub is reachable. **Regenerate token** (in the same settings section) disconnects every paired device.

Browsers only allow camera access on HTTPS or `localhost`. If you open the `http://` address, the scanner falls back to typing the code by hand.

## 5. Cloud sync (Supabase)

1. Create a project at supabase.com. In **SQL Editor**, paste in `supabase/schema.sql` and run it.
2. Under **Authentication → Users**, create a user for each staff member, or let them sign up from inside the app.
3. In PureLab, go to **Settings → Cloud sync**. Enter the project URL and the anon (publishable) key, then sign in.
4. Do this on every device that should sync through the cloud. Devices that only use the hub don't need it.

To use the mobile web app over the internet instead of only on the LAN, deploy `dist/` (from `npm run build:web`) to any HTTPS static host, such as Netlify, Vercel, Render or Cloudflare Pages. On a trusted HTTPS address the service worker caches the app, so it also loads while offline.

## 6. How sync works

| Concern | Approach |
|---|---|
| Local store | IndexedDB (Dexie) on every device. The desktop hub stores data in SQLite (`%APPDATA%/PureLab/purelab-hub.sqlite`). |
| Conflicts | Last-write-wins: the higher `updated_at` wins, and on a tie the higher `device_id` wins. The client, the hub and Postgres all apply the same rule, so every copy ends up identical. |
| Deletes | Soft deletes (`deleted = 1`) that sync like any other change. |
| Push | A local change counter (`_lseq`), with a separate cursor for each remote. One change can go to the hub and to the cloud independently. |
| Pull | Uses a counter assigned by the server (hub `seq` or Postgres `server_seq`), not device clocks, so clock drift between devices can't cause missed changes. |
| Stock | A ledger where entries are only added. Sale entries have fixed IDs (`sale:<invoice>:<product>`), so if two offline devices edit the same invoice, the stock is deducted once, not twice. |
| Invoice numbers | `PREFIX-DEVICE-000123`, which stays unique across devices that were offline at the same time. |

Settings (company details, printer format, sync keys) are stored per device in `localStorage`. Use the same company details on each device.

## 7. Printing

- **A4:** a full tax invoice with your branding, a batch/expiry column, a VAT breakdown by rate, payment details, bank details, your USDT wallet, and a QR code for checking the invoice.
- **Thermal 80 mm:** the page height is measured from the actual receipt, so the PDF and the printout have no blank space at the end. Choose the thermal printer in the print dialog.
- **PDF:** on desktop, a native "Save as" dialog opens and the saved file opens automatically. In a browser, the print dialog opens and you choose **Save as PDF**.
