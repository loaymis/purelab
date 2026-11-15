/**
 * Applies theme (light / dark / follow device), language and text direction to <html>.
 * Mounted once in App.jsx.
 */
import { useEffect } from 'react';
import { useSettings } from '../lib/settings.js';
import { resetFormatCache } from '../lib/format.js';
import { isRTL } from '../i18n/index.js';

const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function resolvedTheme(theme) {
  if (theme === 'dark' || theme === 'light') return theme;
  return media?.matches ? 'dark' : 'light';
}

export function useAppearance() {
  const { appearance } = useSettings();
  const { theme, language, digits } = appearance;

  useEffect(() => {
    const apply = () => {
      const dark = resolvedTheme(theme) === 'dark';
      document.documentElement.classList.toggle('dark', dark);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#090e14' : '#156256');
    };
    apply();
    if (theme !== 'auto' || !media) return undefined;
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = isRTL(language) ? 'rtl' : 'ltr';
    resetFormatCache();
  }, [language, digits]);
}
