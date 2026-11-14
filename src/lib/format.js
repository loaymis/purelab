import { getSettings } from './settings.js';

const fmtCache = new Map();

export function money(value, currency) {
  const s = getSettings();
  const code = currency || s.currency || 'USD';
  const key = `${s.locale}|${code}`;
  if (!fmtCache.has(key)) {
    try {
      fmtCache.set(key, new Intl.NumberFormat(s.locale || 'en-US', { style: 'currency', currency: code }));
    } catch {
      fmtCache.set(key, new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }));
    }
  }
  return fmtCache.get(key).format(Number(value) || 0);
}

export function number(value, digits = 0) {
  return (Number(value) || 0).toLocaleString(getSettings().locale || 'en-US', {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  });
}

export function date(value) {
  if (!value) return '—';
  const d = typeof value === 'string' && value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(getSettings().locale || 'en-US', { year: 'numeric', month: 'short', day: '2-digit' });
}

export function dateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString(getSettings().locale || 'en-US', {
    year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export function relative(ts) {
  if (!ts) return 'never';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return date(ts);
}

export const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export const addDaysISO = (iso, days) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + Number(days || 0));
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export function resetFormatCache() {
  fmtCache.clear();
}
