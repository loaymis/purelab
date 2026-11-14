/**
 * Firebase web app config for the PureLab cloud (Firestore + Auth).
 *
 * Copy it from Firebase console → Project settings → Your apps → Web app → "SDK setup and
 * configuration" → Config. These values identify the project; they are NOT secrets.
 * Data is protected by firestore.rules (owner + approved staff only).
 *
 * When this is null, a device can still be connected by pasting the config in
 * Settings → Cloud (stored per device).
 */
const firebaseConfig = null;

export default firebaseConfig;
