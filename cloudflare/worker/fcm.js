/**
 * fcm.js — Firebase Cloud Messaging push from the Worker (HTTP v1 API).
 *
 * Replaces the Firebase Admin SDK `messaging().send*` calls used by the ported cron /
 * order-stage notifications. Authenticates with a service-account JWT (RS256, signed via
 * Web Crypto), exchanges it for an OAuth access token (cached in KV ~50 min), then POSTs
 * to FCM v1. Everything no-ops cleanly if FCM_SERVICE_ACCOUNT isn't set, so deploys and
 * crons keep working before push is configured.
 *
 * Set up (one-time):
 *   Firebase console → Project settings → Service accounts → Generate new private key
 *   wrangler secret put FCM_SERVICE_ACCOUNT   (paste the whole JSON)
 */

const enc = new TextEncoder();
const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function parseServiceAccount(env) {
  if (!env.FCM_SERVICE_ACCOUNT) return null;
  try { return JSON.parse(env.FCM_SERVICE_ACCOUNT); } catch { return null; }
}

// PEM (PKCS#8) → CryptoKey for RS256 signing.
async function importPrivateKey(pem) {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', der.buffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

async function getAccessToken(env, sa) {
  const cacheKey = `fcm_token:${sa.client_email}`;
  const cached = await env.CACHE.get(cacheKey);
  if (cached) return cached;

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claim = b64url(enc.encode(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  })));
  const key = await importPrivateKey(sa.private_key);
  const sig = b64url(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(`${header}.${claim}`)));
  const assertion = `${header}.${claim}.${sig}`;

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${assertion}`,
  });
  if (!r.ok) { console.error('FCM token error:', await r.text()); return null; }
  const { access_token } = await r.json();
  if (access_token) await env.CACHE.put(cacheKey, access_token, { expirationTtl: 3000 }); // ~50 min
  return access_token || null;
}

/**
 * sendPush(env, tokens, { title, body, url }) — deliver a data push to each token.
 * Returns { sent, failed }. No-op (sent:0) when FCM isn't configured or no tokens.
 * FCM v1 has no multicast, so we fan out (fine for the small admin/owner token sets here).
 */
export async function sendPush(env, tokens, { title, body, url = '/' }) {
  const list = [...new Set((tokens || []).filter(Boolean))];
  if (list.length === 0) return { sent: 0, failed: 0 };
  const sa = parseServiceAccount(env);
  if (!sa) return { sent: 0, failed: 0 };
  const token = await getAccessToken(env, sa);
  if (!token) return { sent: 0, failed: 0 };

  const endpoint = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
  let sent = 0, failed = 0;
  await Promise.all(list.map(async (t) => {
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        // `data`-only payload (matches the app's service worker, which renders the
        // notification from data{title,body,url} — same shape as the Admin SDK calls).
        body: JSON.stringify({ message: { token: t, data: { title, body, url } } }),
      });
      if (r.ok) sent++; else { failed++; }
    } catch { failed++; }
  }));
  return { sent, failed };
}

/** Collect all admin FCM tokens from D1 (users.fcmTokens JSON, isAdmin=1). */
export async function adminTokens(env) {
  const { results } = await env.DB.prepare('SELECT fcmTokens FROM users WHERE isAdmin = 1').all();
  const set = new Set();
  for (const u of results || []) {
    try { (JSON.parse(u.fcmTokens || '[]') || []).forEach((t) => t && set.add(t)); } catch { /* skip */ }
  }
  return [...set];
}

/** Collect one user's FCM tokens. */
export async function userTokens(env, uid) {
  if (!uid) return [];
  const u = await env.DB.prepare('SELECT fcmTokens FROM users WHERE uid = ?').bind(uid).first();
  try { return (JSON.parse(u?.fcmTokens || '[]') || []).filter(Boolean); } catch { return []; }
}
