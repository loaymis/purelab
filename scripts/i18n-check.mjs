/**
 * Lists every UI string that needs a translation and reports any missing from
 * src/i18n/ar.js.   node scripts/i18n-check.mjs [--list]
 *
 * Collects: literals passed to t()/tr()/L()/Ls()/translate(), plus strings that are
 * translated indirectly (labels in constant tables, error messages).
 */
import fs from 'node:fs';
import path from 'node:path';
import ar from '../src/i18n/ar.js';
import { PAYMENT_METHODS, CATEGORIES, CUSTOMER_TYPES } from '../src/lib/settings.js';
import { AUTH_ERRORS } from '../src/hooks/useCloudAccount.js';

const files = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.(jsx?|mjs)$/.test(f) && !p.includes(`${path.sep}i18n${path.sep}`)) files.push(p);
  }
})('src');

const keys = new Set();
const call = /\b(?:t|tr|L|Ls|translate\([^,]+,)\s*\(?\s*(['"`])((?:\\.|(?!\1).)+)\1/g;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(call)) if (!m[2].includes('${')) keys.add(m[2].replace(/\\'/g, "'"));
}
// Strings translated through variables:
const indirect = [
  ...PAYMENT_METHODS.flatMap((m) => [m.label, m.refLabel].filter(Boolean)),
  ...CATEGORIES, ...CUSTOMER_TYPES, 'All',
  ...Object.values(AUTH_ERRORS),
  'Dashboard', 'New Sale', 'Invoices', 'Products', 'Customers', 'Settings',
  'Paid', 'Partial', 'Unpaid', 'Overdue', 'Draft', 'Void',
  'Cloud', 'Desktop hub', 'waiting',
  'Stock received (purchase)', 'Customer return', 'Count correction (+/−)', 'Damaged', 'Expired / destroyed',
  'Free sample / promo', 'Opening stock', 'Sale', 'All stock', 'Low / out of stock', 'Expiring soon',
  'Not signed in to the cloud (Settings → Cloud)', 'Verify your email address to use cloud sync (Settings → Cloud)',
  'Cloud has no owner yet — claim ownership in Settings → Cloud', 'Waiting for the owner to approve this account (Settings → Team)',
  'Hub unreachable — check Wi-Fi and that PureLab desktop is running', 'Hub did not respond (timeout)',
  'Enter a valid email address', 'Choose an image file (PNG, JPG, SVG).', 'Could not read that image.',
  'Paste the firebaseConfig object from the Firebase console', 'Could not read that config — copy the whole firebaseConfig block',
  'Cloud is still connecting — try again in a moment.',
];
indirect.forEach((k) => keys.add(k));

const all = [...keys].sort();
const missing = all.filter((k) => !(k in ar));
if (process.argv.includes('--list')) console.log(JSON.stringify(missing, null, 1));
console.log(`${all.length} strings, ${missing.length} missing in ar.js`);
process.exitCode = missing.length ? 1 : 0;
