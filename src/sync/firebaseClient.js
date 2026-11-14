/**
 * Lazy Firebase client. The SDK is only downloaded when cloud sync is configured, so
 * the offline POS stays fast and works without it.
 */
import defaultConfig from '../firebase.config.js';
import { getSettings } from '../lib/settings.js';

let cache = { key: '', promise: null };

/** Active config: per-device override from Settings, else the build default. */
export function getFirebaseConfig() {
  const override = getSettings().sync.firebaseConfig;
  const cfg = override && override.apiKey ? override : defaultConfig;
  return cfg && cfg.apiKey && cfg.projectId ? cfg : null;
}

/**
 * Accepts what the Firebase console shows — either JSON or the JS snippet
 * `const firebaseConfig = { apiKey: "...", ... };` — and returns a plain object.
 */
export function parseFirebaseConfig(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Paste the firebaseConfig object from the Firebase console');
  const json = match[0]
    .replace(/\/\/.*$/gm, '')
    .replace(/'/g, '"')
    .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
    .replace(/,\s*}/g, '}');
  let cfg;
  try {
    cfg = JSON.parse(json);
  } catch {
    throw new Error('Could not read that config — copy the whole firebaseConfig block');
  }
  for (const k of ['apiKey', 'authDomain', 'projectId', 'appId']) {
    if (!cfg[k]) throw new Error(`Config is missing "${k}"`);
  }
  return cfg;
}

/** Initialise (once per config) and return the SDK modules + app instances. */
export function getFirebase(config = getFirebaseConfig()) {
  if (!config) return Promise.reject(new Error('Cloud is not configured (Settings → Cloud)'));
  const key = JSON.stringify(config);
  if (cache.key !== key) {
    cache = {
      key,
      promise: (async () => {
        const [appMod, authMod, fs] = await Promise.all([
          import('firebase/app'),
          import('firebase/auth'),
          import('firebase/firestore'),
        ]);
        const name = `purelab-${config.projectId}`;
        const app = appMod.getApps().find((a) => a.name === name) || appMod.initializeApp(config, name);
        const auth = authMod.getAuth(app);
        let db;
        try {
          db = fs.initializeFirestore(app, {
            ignoreUndefinedProperties: true,
            experimentalAutoDetectLongPolling: true,
          });
        } catch {
          db = fs.getFirestore(app);
        }
        // Development / testing against the local Firebase Emulator Suite (firebase.json).
        if (config.useEmulators) {
          const host = typeof config.useEmulators === 'string' ? config.useEmulators : '127.0.0.1';
          authMod.connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
          fs.connectFirestoreEmulator(db, host, 8080);
        }
        return { app, auth, db, authMod, fs, config };
      })(),
    };
  }
  return cache.promise;
}

/**
 * Where the signed-in user stands:
 *   signed-out · unverified · no-owner (nobody claimed the project yet) ·
 *   pending (signed in, not approved) · staff · owner
 */
export async function getAccess(fb) {
  await fb.auth.authStateReady();
  const user = fb.auth.currentUser;
  if (!user) return { state: 'signed-out' };
  if (!user.emailVerified) return { state: 'unverified', user };
  const { doc, getDoc } = fb.fs;
  const ownerSnap = await getDoc(doc(fb.db, 'pl_meta', 'owner'));
  const owner = ownerSnap.exists() ? ownerSnap.data() : null;
  if (owner && owner.uid === user.uid) return { state: 'owner', owner, user };
  const staffSnap = await getDoc(doc(fb.db, 'pl_staff', user.email.toLowerCase()));
  if (staffSnap.exists()) return { state: 'staff', owner, user };
  return { state: owner ? 'pending' : 'no-owner', owner, user };
}

export async function claimOwnership(fb) {
  const user = fb.auth.currentUser;
  const { doc, setDoc, serverTimestamp } = fb.fs;
  await setDoc(doc(fb.db, 'pl_meta', 'owner'), {
    uid: user.uid,
    email: user.email.toLowerCase(),
    created_at: serverTimestamp(),
  });
}

export async function listStaff(fb) {
  const { collection, getDocs } = fb.fs;
  const snap = await getDocs(collection(fb.db, 'pl_staff'));
  return snap.docs.map((d) => d.data()).sort((a, b) => a.email.localeCompare(b.email));
}

export async function addStaff(fb, email) {
  const clean = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) throw new Error('Enter a valid email address');
  const { doc, setDoc, serverTimestamp } = fb.fs;
  await setDoc(doc(fb.db, 'pl_staff', clean), { email: clean, added_at: serverTimestamp() });
}

export async function removeStaff(fb, email) {
  const { doc, deleteDoc } = fb.fs;
  await deleteDoc(doc(fb.db, 'pl_staff', email));
}

/** After the user clicks the link in the verification email. */
export async function refreshVerification(fb) {
  const user = fb.auth.currentUser;
  if (!user) return false;
  await user.reload();
  await user.getIdToken(true); // new token carries email_verified=true for the rules
  return fb.auth.currentUser.emailVerified;
}
