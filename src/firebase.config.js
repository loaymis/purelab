/**
 * Firebase web app config for the PureLab cloud (project purelab-46c39).
 *
 * These values identify the project; they are NOT secrets (Firebase web configs are
 * public by design). Data is protected by firestore.rules: only the owner and the
 * staff emails the owner approves can read or write.
 *
 * A device can still be pointed at another project in Settings → Cloud.
 */
const firebaseConfig = {
  apiKey: 'AIzaSyBPe22R8zM3SqegKoNmuLKCzZib79ogrFE',
  authDomain: 'purelab-46c39.firebaseapp.com',
  projectId: 'purelab-46c39',
  storageBucket: 'purelab-46c39.firebasestorage.app',
  messagingSenderId: '569542236821',
  appId: '1:569542236821:web:555a74300529c87491999c',
};

export default firebaseConfig;
