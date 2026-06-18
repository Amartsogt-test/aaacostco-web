import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentSingleTabManager } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";
// NOTE: firebase/storage and firebase/functions are intentionally NOT imported here.
// They are loaded on demand (see uploadFileToStorage / callFunction below) so their
// SDK code stays out of the initial bundle — only Firestore + Auth load at startup.

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: window.location.hostname || import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
export { app };

// Firestore database id. Defaults to the primary "(default)" database (US region).
// To move reads closer to Mongolia, create a Firestore database in an Asia region
// (e.g. asia-northeast3 / Seoul) and set VITE_FIRESTORE_DB_ID to its id — the app
// then talks to that database with NO code change.
const FIRESTORE_DB_ID = import.meta.env.VITE_FIRESTORE_DB_ID || '(default)';

const firestoreSettings = {
    localCache: persistentLocalCache({
        tabManager: persistentSingleTabManager()
    })
};

// 🚀 Performance: offline persistence + (optionally) a region-local named database.
export const db = FIRESTORE_DB_ID === '(default)'
    ? initializeFirestore(app, firestoreSettings)
    : initializeFirestore(app, firestoreSettings, FIRESTORE_DB_ID);

export const auth = getAuth(app);

/**
 * Ensure there is a Firebase session before an operation that Firestore rules gate
 * behind isAuth() — e.g. a GUEST opening the support chat (the chats collection
 * requires an authenticated, owning user). Logged-in users already have a session;
 * guests get a lightweight anonymous one. Security rules stay unchanged: the
 * anonymous user simply owns its own conversation.
 *
 * Returns the Firebase user, or null if anonymous sign-in isn't available (e.g.
 * the "Anonymous" provider isn't enabled in the Firebase console) — callers treat
 * null as "couldn't authenticate" and degrade gracefully.
 *
 * NOTE: enable Authentication → Sign-in method → Anonymous in the Firebase console.
 */
export async function ensureSignedIn() {
    if (auth.currentUser) return auth.currentUser;
    try {
        const cred = await signInAnonymously(auth);
        return cred.user;
    } catch (e) {
        console.warn('Anonymous sign-in unavailable:', e?.code || e?.message);
        return null;
    }
}

// Callable functions are deployed in asia-northeast3 (Seoul) for lower latency from
// Mongolia. This must stay in sync with the region set on each onCall in functions/index.js.
const FUNCTIONS_REGION = 'asia-northeast3';

/**
 * 🚀 Lazy file upload — dynamically loads the Storage SDK only when first used.
 * Returns the public download URL. getStorage() memoizes per app, so repeated
 * calls reuse the same instance.
 */
export async function uploadFileToStorage(path, file) {
    const { getStorage, ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
    const storage = getStorage(app);
    const storageRef = ref(storage, path);
    const snapshot = await uploadBytes(storageRef, file);
    return getDownloadURL(snapshot.ref);
}

/**
 * 🚀 Lazy callable function — dynamically loads the Functions SDK only when first
 * used. `options` maps to HttpsCallableOptions (e.g. { timeout }).
 */
export async function callFunction(name, data, options) {
    const { getFunctions, httpsCallable } = await import('firebase/functions');
    const fns = getFunctions(app, FUNCTIONS_REGION);
    return httpsCallable(fns, name, options)(data);
}


