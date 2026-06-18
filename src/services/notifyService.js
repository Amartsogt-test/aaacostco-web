// 🔔 Lightweight desktop/mobile notifications for new chat messages.
//
// Uses the browser Notification API — works whenever a tab is open (including a
// BACKGROUNDED tab), so admins keeping the dashboard open get alerted to new
// customer messages, and users get alerted to admin replies. It does NOT cover
// the "app fully closed" case — that needs Firebase Cloud Messaging (a VAPID key
// + a Cloud Function), which can be layered on top later.
//
// Everything here is best-effort and guarded: if the API is unavailable or the
// user declines, it silently no-ops and the app behaves exactly as before.

const supported = () => typeof window !== 'undefined' && 'Notification' in window;

let _dedupeKey = null;

/**
 * Ask for notification permission. Safe to call repeatedly — it only prompts when
 * the permission is still 'default'. Returns true if granted.
 */
export async function ensureNotifyPermission() {
    if (!supported()) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    try {
        return (await Notification.requestPermission()) === 'granted';
    } catch {
        return false;
    }
}

/**
 * Show a notification for an incoming chat message. Skipped when the tab is
 * currently focused (the user is already looking at it) and de-duplicated by key.
 */
export function notifyNewMessage({ title, body, key } = {}) {
    if (!supported() || Notification.permission !== 'granted') return;
    // Don't interrupt someone actively looking at the page.
    if (document.visibilityState === 'visible' && document.hasFocus && document.hasFocus()) return;
    if (key && key === _dedupeKey) return;
    _dedupeKey = key || null;
    try {
        const n = new Notification(title || 'Costco Mongolia', {
            body: (body || '').slice(0, 140),
            icon: '/pwa-192x192.png',
            badge: '/pwa-192x192.png',
            tag: 'costco-chat'
        });
        n.onclick = () => {
            try { window.focus(); } catch { /* ignore */ }
            n.close();
        };
    } catch {
        /* ignore — notification failed, not critical */
    }
}
