// pushService — DISABLED.
//
// Firebase Cloud Messaging (background web push) was removed in the Cloudflare migration.
// Cloudflare has no native push service, so closed-app push is currently unavailable. The
// in-app/foreground notifications (notifyService.js, the Web Notification API) still work.
//
// To re-enable closed-app push later, implement the standard Web Push (VAPID) protocol:
// subscribe via PushManager in the PWA service worker, store the subscription on the user
// (userApi.update), and have the Worker send pushes with the `web-push` protocol. These
// methods are kept as no-ops so existing call sites keep working.

export const pushService = {
    async enableForUser() { /* no-op: closed-app push disabled */ },
    async enableForAdmin() { /* no-op: closed-app push disabled */ },
};
