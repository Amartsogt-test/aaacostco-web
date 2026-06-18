/* global importScripts, firebase */
// 🔔 Firebase Cloud Messaging background handler.
// Shows a notification when a chat message arrives while the app/tab is closed.
//
// The Firebase config is passed in as query params at registration time (these are
// PUBLIC client keys, already present in the app bundle — no secrets here), so we
// don't have to hard-code project values into this file.
importScripts('https://www.gstatic.com/firebasejs/12.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.7.0/firebase-messaging-compat.js');

try {
    const params = new URL(self.location).searchParams;
    firebase.initializeApp({
        apiKey: params.get('apiKey'),
        authDomain: params.get('authDomain'),
        projectId: params.get('projectId'),
        storageBucket: params.get('storageBucket'),
        messagingSenderId: params.get('messagingSenderId'),
        appId: params.get('appId'),
    });

    const messaging = firebase.messaging();

    // We send DATA-ONLY messages (no `notification` payload) so this handler always
    // runs and we control the display — avoids the browser also auto-showing one
    // (which would double up).
    messaging.onBackgroundMessage((payload) => {
        const data = (payload && payload.data) || {};
        self.registration.showNotification(data.title || 'Costco Mongolia', {
            body: data.body || '',
            icon: '/pwa-192x192.png',
            badge: '/pwa-192x192.png',
            tag: 'costco-chat',
            data: { url: data.url || '/' },
        });
    });
} catch (e) {
    // If config params are missing the SW simply does nothing.
    // eslint-disable-next-line no-console
    console.warn('FCM SW init skipped:', e && e.message);
}

// Focus/open the app when a notification is clicked.
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || '/';
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client) return client.focus();
            }
            if (self.clients.openWindow) return self.clients.openWindow(url);
        })
    );
});
