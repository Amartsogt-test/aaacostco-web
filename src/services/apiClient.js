// Optional Cloudflare Worker API (Phase-1 read path off Firebase).
//
// When VITE_API_BASE is set (e.g. https://costco-api.costcomn.workers.dev), product
// detail + search reads are served from the edge Worker (D1) — lower latency from
// Mongolia than the US Firestore. When it's unset, everything falls back to the
// existing Firestore / static-index path, so this is fully reversible: just don't set
// the env var. Each caller also try/catches and falls back on any Worker error.

const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

export const apiEnabled = () => !!API_BASE;

async function get(path) {
    const r = await fetch(API_BASE + path, { cache: 'default' });
    if (!r.ok) throw new Error(`api ${r.status}`);
    return r.json();
}

export const api = {
    product: (id) => get(`/api/product/${encodeURIComponent(id)}`),
    search: (q) => get(`/api/search?q=${encodeURIComponent(q)}`),
    products: (params = {}) => get(`/api/products?${new URLSearchParams(params)}`),
    categories: () => get('/api/categories'),
    settings: (id = 'general') => get(`/api/settings?id=${encodeURIComponent(id)}`),
    productsCount: (params = {}) => get(`/api/products/count?${new URLSearchParams(params)}`),
    categoryCounts: () => get('/api/category-counts'),
};

// ---------------------------------------------------------------------------
// Phase 2/3 — auth + orders + payments on the Worker (JWT sessions on D1).
//
// SEPARATE flag from reads: VITE_USE_WORKER_AUTH must ALSO be true for the frontend
// to authenticate / create orders / pay via the Worker (instead of Firebase). This
// keeps the safe Phase-1 read cutover independent from the bigger transactional one,
// so enabling Worker reads doesn't accidentally break Firebase-backed login/checkout.
// Turn it on only after the Worker payment path is live and tested.
// ---------------------------------------------------------------------------
const TOKEN_KEY = 'cf_auth_token';
export const workerAuthEnabled = () => apiEnabled() && import.meta.env.VITE_USE_WORKER_AUTH === 'true';
export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };
export const setToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } };

// Raw binary upload (the File is the body, not JSON). Returns the served URL string.
async function rawUpload(path, file) {
    const t = getToken();
    const r = await fetch(API_BASE + path, {
        method: 'POST',
        headers: {
            ...(t ? { Authorization: `Bearer ${t}` } : {}),
            'Content-Type': file.type || 'application/octet-stream',
            'X-Filename': (file.name || 'upload').replace(/[^\w.-]/g, '_'),
        },
        body: file,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(data?.error || `api ${r.status}`); e.status = r.status; throw e; }
    return data.url;
}

async function call(path, { method = 'GET', body, auth = false } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth) { const t = getToken(); if (t) headers.Authorization = `Bearer ${t}`; }
    const r = await fetch(API_BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(data?.error || `api ${r.status}`); e.status = r.status; e.data = data; throw e; }
    return data;
}

export const authApi = {
    smsRequest: (phone) => call('/api/auth/sms/request', { method: 'POST', body: { phone } }),
    smsVerify: (sessionId) => call('/api/auth/sms/verify', { method: 'POST', body: { sessionId } }),
    adminLogin: (phone, password) => call('/api/auth/admin/login', { method: 'POST', body: { phone, password } }),
    me: () => call('/api/auth/me', { auth: true }),
    logout: () => setToken(''),
};

export const orderApi = {
    create: (order) => call('/api/orders', { method: 'POST', body: { order }, auth: true }),
    list: () => call('/api/orders', { auth: true }),
    get: (id, phone) => call(`/api/order/${encodeURIComponent(id)}${phone ? `?phone=${encodeURIComponent(phone)}` : ''}`, { auth: true }),
    wireCreate: (orderId, amount) => call('/api/payments/wire/create', { method: 'POST', body: { orderId, amount }, auth: true }),
    requestReturn: (orderId, reason) => call('/api/order/return', { method: 'POST', body: { orderId, reason }, auth: true }),
    cancelUnpaid: (orderId) => call('/api/order/cancel', { method: 'POST', body: { orderId }, auth: true }),
};

export const cartApi = {
    save: (itemCount) => call('/api/cart', { method: 'POST', body: { itemCount }, auth: true }),
};

export const userApi = {
    get: () => call('/api/user', { auth: true }),
    update: (patch) => call('/api/user', { method: 'POST', body: patch, auth: true }),
};

export const adminApi = {
    orders: () => call('/api/admin/orders', { auth: true }),
    setStage: (id, stage, note) => call('/api/admin/order/stage', { method: 'POST', body: { id, stage, note }, auth: true }),
    patchOrder: (id, patch) => call('/api/admin/order/patch', { method: 'POST', body: { id, patch }, auth: true }),
    setSetting: (id, data) => call('/api/admin/settings', { method: 'POST', body: { id, data }, auth: true }),
    getSetting: (id) => call(`/api/admin/settings?id=${encodeURIComponent(id)}`, { auth: true }),
    upsertProduct: (product) => call('/api/admin/product', { method: 'POST', body: { product }, auth: true }),
    deleteProduct: (id) => call('/api/admin/product/delete', { method: 'POST', body: { id }, auth: true }),
    chats: () => call('/api/admin/chats', { auth: true }),
    chat: (id) => call(`/api/admin/chat/${encodeURIComponent(id)}`, { auth: true }),
    manifests: () => call('/api/admin/manifests', { auth: true }),
    chatReply: (chatId, text, metadata = null, attachment = null) => call('/api/admin/chat/message', {
        method: 'POST',
        body: {
            chatId,
            text,
            ...(metadata ? { metadata } : {}),
            ...(attachment ? { attachment } : {}),
        },
        auth: true,
    }),
    uploadImage: (file) => rawUpload('/api/admin/product/image', file), // → R2 URL
    coupons: () => call('/api/admin/coupons', { auth: true }),
    upsertCoupon: (coupon) => call('/api/admin/coupon', { method: 'POST', body: { coupon }, auth: true }),
    deleteCoupon: (code) => call('/api/admin/coupon/delete', { method: 'POST', body: { code }, auth: true }),
    products: (status = 'inactive') => call(`/api/admin/products?status=${encodeURIComponent(status)}`, { auth: true }),
    aiReview: () => call('/api/admin/ai-review', { auth: true }),
    pinMessage: (messageId, pinned) => call('/api/admin/chat/pin', { method: 'POST', body: { messageId, pinned }, auth: true }),
    likeMessage: (messageId, liked) => call('/api/admin/chat/like', { method: 'POST', body: { messageId, liked }, auth: true }),
    broadcast: (text) => call('/api/admin/chat/broadcast', { method: 'POST', body: { text }, auth: true }),
    setCategoryBanner: (id, banner) => call('/api/admin/category/banner', { method: 'POST', body: { id, banner }, auth: true }),
    dailyReports: (date) => call(date ? `/api/admin/daily-reports?date=${encodeURIComponent(date)}` : '/api/admin/daily-reports', { auth: true }),
    user: (uid) => call(`/api/admin/user/${encodeURIComponent(uid)}`, { auth: true }),
    telemetry: () => call('/api/admin/telemetry', { auth: true }),
    selfHeal: () => call('/api/admin/self-heal', { method: 'POST', body: {}, auth: true }),
    executiveReport: () => call('/api/admin/executive-report', { method: 'POST', body: {}, auth: true }),
};

export const couponApi = {
    validate: (code, subtotalMNT) => call('/api/coupon/validate', { method: 'POST', body: { code, subtotalMNT } }),
};

export const aiApi = {
    summary: (product) => call('/api/ai/summary', { method: 'POST', body: { product }, auth: true }),
    scan: (imageBase64) => call('/api/ai/scan', { method: 'POST', body: { imageBase64 }, auth: true }),
};

export const chatApi = {
    get: (markRead = true) => call(`/api/chat${markRead ? '' : '?markRead=0'}`, { auth: true }),
    send: (text, metadata = null, sender = undefined, attachment = null) => call('/api/chat/message', {
        method: 'POST',
        body: {
            text,
            ...(metadata ? { metadata } : {}),
            ...(sender ? { sender } : {}),
            ...(attachment ? { attachment } : {}),
        },
        auth: true,
    }),
    upload: (file) => rawUpload('/api/chat/upload', file), // chat attachment → R2 URL
};
