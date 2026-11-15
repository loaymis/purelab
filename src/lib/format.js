import { getSettings } from './settings.js';
import { getLocale, t } from '../i18n/index.js';

const fmtCache = new Map();

export function money(value, currency) {
  const s = getSettings();
  const code = currency || s.currency || 'USD';
  const locale = getLocale();
  const key = `${locale}|${code}`;
  if (!fmtCache.has(key)) {
    try {
      // narrowSymbol gives "$" rather than "US$" in most locales.
      fmtCache.set(key, new Intl.NumberFormat(locale, { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' }));
    } catch {
      fmtCache.set(key, new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }));
    }
  }
  const out = fmtCache.get(key).format(Number(value) || 0);
  // Arabic still says "US$"; the Latin letters get reordered inside RTL text ("$US"), so use "$".
  return locale.startsWith('ar') ? out.replace('US$', '$') : out;
}

export function number(value, digits = 0) {
  return (Number(value) || 0).toLocaleString(getLocale(), {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  });
}

export function date(value) {
  if (!value) return '—';
  const d = typeof value === 'string' && value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(getLocale(), { year: 'numeric', month: 'short', day: '2-digit' });
}

export function dateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString(getLocale(), {
    year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export function relative(ts) {
  if (!ts) return t('never');
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 10) return t('just now');
  if (s < 60) return t('{n}s ago', { n: s });
  if (s < 3600) return t('{n}m ago', { n: Math.floor(s / 60) });
  if (s < 86400) return t('{n}h ago', { n: Math.floor(s / 3600) });
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
