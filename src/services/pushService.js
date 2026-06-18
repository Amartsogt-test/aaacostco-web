// 🔔 Firebase Cloud Messaging (FCM) — background push for chat messages, i.e.
// notifications that arrive even when the app is fully CLOSED. This layers on top
// of notifyService.js (which only covers an open/backgrounded tab).
//
// SAFE BY DEFAULT: everything is gated on VITE_FIREBASE_VAPID_KEY. If that env var
// isn't set, every function here is a no-op and the app behaves exactly as before.
// To enable: Firebase console → Project settings → Cloud Messaging → Web Push
// certificates → copy the key pair "Key pair" value into VITE_FIREBASE_VAPID_KEY,
// then redeploy. (Also deploy the notifyChatMessage Cloud Function.)

import { app, db } from '../firebase';
import { doc, setDoc, arrayUnion } from 'firebase/firestore';
import { ensureNotifyPermission, notifyNewMessage } from './notifyService';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

const firebaseConfigParams = () =>
    new URLSearchParams({
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
        storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
        appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
    }).toString();

let _tokenPromise = null;
let _foregroundBound = false;

// Acquire (and memoize) the FCM registration token. Returns null when push is not
// configured/supported or permission is denied.
function getFcmToken() {
    if (_tokenPromise) return _tokenPromise;
    _tokenPromise = (async () => {
        try {
            if (!VAPID_KEY) return null; // push disabled until a VAPID key is set
            if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;

            const { getMessaging, getToken, onMessage, isSupported } = await import('firebase/messaging');
            if (!(await isSupported())) return null;

            const granted = await ensureNotifyPermission();
            if (!granted) return null;

            // Register the dedicated FCM service worker (separate scope from the PWA
            // Workbox SW). Config travels as query params so the SW needs no secrets.
            const swUrl = `/firebase-messaging-sw.js?${firebaseConfigParams()}`;
            const swReg = await navigator.serviceWorker.register(swUrl, {
                scope: '/firebase-cloud-messaging-push-scope',
            });

            const messaging = getMessaging(app);
            const token = await getToken(messaging, {
                vapidKey: VAPID_KEY,
                serviceWorkerRegistration: swReg,
            });

            // Foreground messages don't fire the SW handler — show them ourselves.
            if (!_foregroundBound) {
                _foregroundBound = true;
                onMessage(messaging, (payload) => {
                    const d = (payload && payload.data) || {};
                    notifyNewMessage({ title: d.title || 'Costco Mongolia', body: d.body || '', key: payload?.messageId });
                });
            }

            return token || null;
        } catch (e) {
            console.warn('FCM token unavailable:', e?.message);
            return null;
        }
    })();
    return _tokenPromise;
}

export const pushService = {
    // Save the token on the conversation so admin replies push to this user/device.
    async enableForUser(conversationId) {
        try {
            const token = await getFcmToken();
            if (!token || !conversationId) return;
            await setDoc(doc(db, 'chats', conversationId), { userTokens: arrayUnion(token) }, { merge: true });
        } catch (e) {
            console.warn('Push (user) not enabled:', e?.message);
        }
    },

    // Save the token on the admin's user doc so customer messages push to them.
    async enableForAdmin(uid) {
        try {
            const token = await getFcmToken();
            if (!token || !uid) return;
            await setDoc(doc(db, 'users', uid), { fcmTokens: arrayUnion(token) }, { merge: true });
        } catch (e) {
            console.warn('Push (admin) not enabled:', e?.message);
        }
    },
};
