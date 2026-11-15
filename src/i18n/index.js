/**
 * Tiny i18n layer. English text is the key; other languages map English → translation,
 * so an untranslated string simply shows in English (never a blank or a key name).
 *
 *   const t = useT();  t('Hello {name}', { name })
 *
 * Arabic switches the document to right-to-left (see hooks/useAppearance.js).
 */
import { useSyncExternalStore } from 'react';
import { getSettings, subscribeSettings } from '../lib/settings.js';
import ar from './ar.js';

const DICTS = { ar };
export const LANGUAGES = [
  { id: 'en', label: 'English', dir: 'ltr' },
  { id: 'ar', label: 'العربية', dir: 'rtl' },
];

export const getLanguage = () => getSettings().appearance?.language || 'en';
export const isRTL = (lang = getLanguage()) => lang === 'ar';

function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m));
}

/** Translate into a specific language (used by bilingual invoices). */
export function translate(lang, text, vars) {
  const dict = DICTS[lang];
  return interpolate((dict && dict[text]) || text, vars);
}

/** Translate into the current app language. */
export const t = (text, vars) => translate(getLanguage(), text, vars);

/** BCP-47 locale for Intl formatting, honouring the Arabic digit preference. */
export function getLocale(lang = getLanguage()) {
  const s = getSettings();
  if (lang === 'ar') return s.appearance?.digits === 'arab' ? 'ar-u-nu-arab' : 'ar-u-nu-latn';
  return s.locale && !/^ar/i.test(s.locale) ? s.locale : 'en-US';
}

/** React hook: re-renders when the language changes; returns t(). */
export function useT() {
  useSyncExternalStore(subscribeSettings, getLanguage, getLanguage);
  return t;
}
