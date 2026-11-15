/**
 * Shared cloud-account state (Firebase Auth + PureLab access level), used by the
 * Welcome screen, the account menu and Settings → Cloud.
 *
 * state: 'disabled' (no Firebase config) · 'loading' · 'signed-out' · 'unverified' ·
 *        'no-owner' · 'pending' · 'staff' · 'owner' · 'error'
 */
import { useSyncExternalStore } from 'react';
import {
  getFirebase, getFirebaseConfig, getAccess, claimOwnership, refreshVerification,
} from '../sync/firebaseClient.js';
import { subscribeSettings } from '../lib/settings.js';
import { syncEngine } from '../sync/engine.js';

let snapshot = { state: getFirebaseConfig() ? 'loading' : 'disabled', user: null, owner: null, fb: null, error: null };
const listeners = new Set();
let configKey = '';
let unsubAuth = () => {};

function set(patch) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((l) => l());
}

export async function refreshAccount() {
  if (!snapshot.fb) return snapshot;
  try {
    const a = await getAccess(snapshot.fb);
    set({ state: a.state, user: a.user || null, owner: a.owner || null, error: null });
    if (a.state === 'owner' || a.state === 'staff') syncEngine.syncSoon(300);
  } catch (err) {
    // Offline but previously signed in: keep working locally, report it softly.
    const user = snapshot.fb.auth.currentUser;
    set({ state: user ? 'error' : 'signed-out', user, error: err.code === 'unavailable' ? 'offline' : err.message });
  }
  return snapshot;
}

function connect() {
  const cfg = getFirebaseConfig();
  const key = cfg ? JSON.stringify(cfg) : '';
  if (key === configKey) return;
  configKey = key;
  unsubAuth();
  if (!cfg) { set({ state: 'disabled', user: null, owner: null, fb: null }); return; }
  set({ state: 'loading', fb: null });
  getFirebase(cfg)
    .then((fb) => {
      set({ fb });
      unsubAuth = fb.authMod.onAuthStateChanged(fb.auth, () => refreshAccount());
    })
    .catch((err) => set({ state: 'error', error: err.message }));
}

function subscribe(fn) {
  if (listeners.size === 0) connect();
  listeners.add(fn);
  return () => listeners.delete(fn);
}
subscribeSettings(connect); // config changed in Settings → reconnect

export function useCloudAccount() {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}

/* --------------------------------------------------------------- actions */
const fb = () => {
  if (!snapshot.fb) throw new Error('Cloud is still connecting — try again in a moment.');
  return snapshot.fb;
};

export async function signIn(email, password) {
  const c = fb();
  await c.authMod.signInWithEmailAndPassword(c.auth, email.trim(), password);
  return refreshAccount();
}

export async function signUp(email, password) {
  const c = fb();
  const cred = await c.authMod.createUserWithEmailAndPassword(c.auth, email.trim(), password);
  await c.authMod.sendEmailVerification(cred.user);
  return refreshAccount();
}

export const resetPassword = (email) => fb().authMod.sendPasswordResetEmail(fb().auth, email.trim());
export const resendVerification = () => fb().authMod.sendEmailVerification(fb().auth.currentUser);
export const signOut = () => fb().authMod.signOut(fb().auth);

export async function checkVerified() {
  const ok = await refreshVerification(fb());
  if (ok) await refreshAccount();
  return ok;
}

export async function claim() {
  await claimOwnership(fb());
  return refreshAccount();
}

export const AUTH_ERRORS = {
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/wrong-password': 'Wrong email or password.',
  'auth/user-not-found': 'Wrong email or password.',
  'auth/invalid-email': 'That email address is not valid.',
  'auth/email-already-in-use': 'An account with this email already exists — sign in instead.',
  'auth/weak-password': 'Use a password with at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
  'auth/network-request-failed': 'No internet connection.',
  'auth/operation-not-allowed': 'Email sign-in is not enabled for this project.',
  'permission-denied': 'Permission denied.',
};
export const authErrorText = (err, t) => t(AUTH_ERRORS[err?.code] || err?.message || String(err));
