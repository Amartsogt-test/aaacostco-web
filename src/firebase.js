import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentSingleTabManager } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: "costco-fe034.appspot.com",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);

// 🚀 Performance: Enable offline persistence for faster loads
export const db = initializeFirestore(app, {
    localCache: persistentLocalCache({
        tabManager: persistentSingleTabManager()
    })
});

export const storage = getStorage(app);
export const auth = getAuth(app);
import { getFunctions } from "firebase/functions";
export const functions = getFunctions(app);

// Firebase initialized with offline persistence


