/**
 * Device-local settings (localStorage) with a tiny subscribe API + React hook.
 * Business data lives in IndexedDB (see src/db); settings are per device so a
 * cashier's printer format or sync credentials never leak to other devices.
 */
import { useSyncExternalStore } from 'react';
import { uuid, randomCode } from './ids.js';

const KEY = 'purelab.settings.v1';

export const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash', needsRef: false },
  { id: 'card', label: 'Credit / Debit Card', needsRef: true, refLabel: 'Approval code / last 4' },
  { id: 'transfer', label: 'Bank Transfer', needsRef: true, refLabel: 'Transfer reference' },
  { id: 'usdt', label: 'Crypto (USDT)', needsRef: true, refLabel: 'Tx hash (TRC20 / ERC20)' },
  { id: 'cheque', label: 'Cheque', needsRef: true, refLabel: 'Cheque number' },
  { id: 'mobile', label: 'Mobile Wallet', needsRef: true, refLabel: 'Wallet reference' },
];

export const CATEGORIES = ['Pharmaceutical', 'Dermo-cosmetic', 'Supplement', 'Medical device', 'Other'];
export const CUSTOMER_TYPES = ['Retail', 'Pharmacy', 'Clinic', 'Hospital', 'Distributor'];

function defaults() {
  return {
    deviceId: uuid(),
    deviceCode: randomCode(3),
    company: {
      name: 'PureLab',
      tagline: 'Pharmaceutical & Dermo-Cosmetic Laboratories',
      address: '',
      phone: '',
      email: '',
      website: '',
      taxId: '',
      license: '',
    },
    currency: 'USD',
    locale: 'en-US',
    invoicePrefix: 'PL',
    defaultTaxRate: 0,
    paymentTermsDays: 0,
    printFormat: 'a4', // 'a4' | 'thermal'
    invoiceFooter: 'Thank you for choosing PureLab. Store medicines below 25°C, out of reach of children.',
    bankDetails: '',
    usdtWallet: '',
    lowStockDefault: 10,
    expiryWarningDays: 90,
    sync: {
      autoSync: true,
      intervalSec: 60,
      firebaseConfig: null, // per-device override of src/firebase.config.js
      hubUrl: '',
      hubToken: '',
    },
  };
}

function load() {
  const base = defaults();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!saved) {
      localStorage.setItem(KEY, JSON.stringify(base));
      return base;
    }
    return {
      ...base,
      ...saved,
      company: { ...base.company, ...(saved.company || {}) },
      sync: { ...base.sync, ...(saved.sync || {}) },
    };
  } catch {
    return base;
  }
}

let state = load();
const listeners = new Set();

export const getSettings = () => state;

export function updateSettings(patch) {
  const next = typeof patch === 'function' ? patch(state) : { ...state, ...patch };
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Could not persist settings', err);
  }
  listeners.forEach((l) => l());
}

export function subscribeSettings(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useSettings() {
  return useSyncExternalStore(subscribeSettings, getSettings, getSettings);
}

// Keep multiple tabs in sync.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      state = load();
      listeners.forEach((l) => l());
    }
  });
}
