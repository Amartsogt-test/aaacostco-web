// settingsService — Cloudflare Worker only (Firestore removed).
// Settings live in D1 `settings` (id='general' | 'currency' | 'scraper'), served by the
// Worker: public reads via GET /api/settings, admin reads via GET /api/admin/settings,
// writes via POST /api/admin/settings. There is no realtime push on the edge, so the
// former onSnapshot subscriptions are emulated with a one-shot fetch + light polling.
import { api, adminApi } from './apiClient';

// Poll interval for the "subscribe" emulations. Settings change rarely, so 60s is plenty.
const POLL_MS = 60 * 1000;

// Shared poller: fetch once immediately, then every POLL_MS; returns an unsubscribe fn.
function poll(fetcher, callback) {
    let stopped = false;
    const tick = async () => {
        try { const data = await fetcher(); if (!stopped) callback(data); }
        catch (e) { if (!stopped) console.error('settings poll error:', e?.message || e); }
    };
    tick();
    const iv = setInterval(tick, POLL_MS);
    return () => { stopped = true; clearInterval(iv); };
}

export const settingsService = {
    // One-shot read of the general settings doc.
    getSettings: async () => {
        try { return await api.settings('general'); }
        catch (error) { console.error('Error fetching settings:', error); throw error; }
    },

    // Emulated realtime: initial fetch + 60s poll.
    subscribeToSettings: (callback) => poll(() => api.settings('general'), (d) => callback(d || null)),

    updateSettings: async (data) => {
        try { await adminApi.setSetting('general', data); }
        catch (error) { console.error('Error updating settings:', error); throw error; }
    },

    // Scraper config is admin-only (not exposed on the public settings endpoint).
    getScraperSettings: async () => {
        try { return await adminApi.getSetting('scraper'); }
        catch (error) { console.error('Error fetching scraper settings:', error); return null; }
    },

    updateScraperSettings: async (data) => {
        try { await adminApi.setSetting('scraper', data); }
        catch (error) { console.error('Error updating scraper settings:', error); throw error; }
    },

    // Currency rates doc (public-readable). Emulated realtime via poll.
    subscribeToCurrency: (callback) => poll(() => api.settings('currency'), (d) => callback(d || null)),

    // The old Firestore implementation set a refreshTrigger flag that a Firebase function
    // watched. On Cloudflare the rates are refreshed by the Worker cron / core:bank-rates
    // job, so this just flips the same flag (harmless no-op consumer) for compatibility.
    triggerBankRefresh: async () => {
        try { await adminApi.setSetting('currency', { refreshTrigger: true, refreshRequestedAt: new Date().toISOString() }); }
        catch (error) { console.error('Error triggering bank refresh:', error); throw error; }
    },
};
