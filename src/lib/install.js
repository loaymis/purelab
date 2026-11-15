/**
 * "Install app" support for the web version (PWA).
 * Chrome/Edge/Android fire `beforeinstallprompt`; iOS Safari needs manual
 * "Share → Add to Home Screen", so we show a hint there instead.
 */
import { useSyncExternalStore } from 'react';

let deferred = null;
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    emit();
  });
}

const isStandalone = () => typeof window !== 'undefined'
  && (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true);
const isIOS = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;

function getState() {
  if (window.purelab?.isDesktop || isStandalone()) return 'installed';
  if (deferred) return 'available';
  if (isIOS()) return 'ios';
  return 'unavailable';
}

export function useInstall() {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, getState, getState);
}

export async function promptInstall() {
  if (!deferred) return false;
  deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  emit();
  return outcome === 'accepted';
}
