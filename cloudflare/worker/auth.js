/**
 * auth.js — Phase-2 authentication foundation for the Cloudflare Worker.
 *
 * The reusable bedrock that every login flow (SMS, Facebook, admin) builds on:
 *   • signToken / verifyToken — stateless HS256 JWT via Web Crypto (no deps).
 *   • createSession / readSession — KV-backed sessions (revocable; 30-day TTL).
 *   • authenticate(request, env) — resolve the caller's user from a Bearer token.
 *   • requireAdmin(user) — gate admin-only routes.
 *
 * Requires secret: `wrangler secret put JWT_SECRET` (a long random string).
 * The actual login ENDPOINTS (issue a token after SMS/Facebook/admin verification)
 * are wired in index.js — they call createSession() once identity is proven. Those
 * flows need your specifics (SMS carrier webhook contract, Facebook app id/secret,
 * admin password hash) so they're built next, on top of this foundation.
 */

const enc = new TextEncoder();
const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlJSON = (obj) => b64url(enc.encode(JSON.stringify(obj)));

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/** Sign a stateless JWT (HS256). `payload` should include `sub` (uid) + `exp`. */
export async function signToken(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const data = `${b64urlJSON(header)}.${b64urlJSON(payload)}`;
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(data));
  return `${data}.${b64url(sig)}`;
}

/** Verify a JWT and return its payload, or null if invalid/expired. */
export async function verifyToken(token, secret) {
  try {
    const [h, p, s] = (token || '').split('.');
    if (!h || !p || !s) return null;
    const ok = await crypto.subtle.verify(
      'HMAC', await hmacKey(secret),
      Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
      enc.encode(`${h}.${p}`)
    );
    if (!ok) return null;
    const payload = JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;   // expired
    return payload;
  } catch { return null; }
}

const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days
const MEM_AUTH_TTL_MS = 30 * 1000;     // 30s isolate memory cache to save KV reads + D1 lookups
const memAuthCache = new Map();

export function invalidateAuthMemCache(uidOrSid) {
  if (!uidOrSid) { memAuthCache.clear(); return; }
  for (const [k, v] of memAuthCache.entries()) {
    if (k === uidOrSid || v?.user?.uid === uidOrSid) memAuthCache.delete(k);
  }
}

/**
 * Issue a session: store it in KV (so it can be revoked) and return a JWT carrying the
 * session id + uid. Call this only AFTER identity is proven by a login flow.
 */
export async function createSession(env, user) {
  const sid = crypto.randomUUID();
  await env.CACHE.put(`session:${sid}`, JSON.stringify({ uid: user.uid, isAdmin: !!user.isAdmin }),
    { expirationTtl: SESSION_TTL });
  const token = await signToken(
    { sub: user.uid, sid, isAdmin: !!user.isAdmin, exp: Math.floor(Date.now() / 1000) + SESSION_TTL },
    env.JWT_SECRET
  );
  return { token, sid };
}

/** Revoke a session (logout). */
export async function destroySession(env, sid) {
  if (sid) {
    memAuthCache.delete(sid);
    await env.CACHE.delete(`session:${sid}`);
  }
}

/**
 * Resolve the authenticated user from the request's Bearer token. Verifies the JWT,
 * confirms the KV session still exists (revocation), and loads the user from D1.
 * Returns null when unauthenticated.
 */
export async function authenticate(request, env) {
  const syncSecret = request.headers.get('X-Admin-Sync-Secret');
  if (syncSecret && env.ADMIN_SYNC_SECRET && syncSecret === env.ADMIN_SYNC_SECRET) {
    return { uid: 'system-sync', name: 'System Sync', isAdmin: true, loginProvider: 'admin' };
  }
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token || !env.JWT_SECRET) return null;
  const payload = await verifyToken(token, env.JWT_SECRET);
  if (!payload?.sub || !payload?.sid) return null;

  const now = Date.now();
  const cachedHit = memAuthCache.get(payload.sid);
  if (cachedHit && cachedHit.exp > now) {
    return cachedHit.user;
  }

  const sess = await env.CACHE.get(`session:${payload.sid}`);
  if (!sess) {
    memAuthCache.delete(payload.sid);
    return null;                                   // revoked / expired
  }
  const row = await env.DB.prepare(
    'SELECT uid, phone, name, email, isAdmin, tier, loyaltyPointsKRW, loginProvider, registrationMethod FROM users WHERE uid = ?'
  ).bind(payload.sub).first();
  if (!row) return null;
  const userObj = {
    ...row,
    isAdmin: !!row.isAdmin,
    loginProvider: row.loginProvider || (row.isAdmin ? 'admin' : 'sms'),
    registrationMethod: row.registrationMethod || 'sms',
  };
  if (memAuthCache.size > 500) {
    const oldestKey = memAuthCache.keys().next().value;
    if (oldestKey) memAuthCache.delete(oldestKey);
  }
  memAuthCache.set(payload.sid, { user: userObj, exp: now + MEM_AUTH_TTL_MS });
  return userObj;
}

/** Throwable guard for admin-only routes. */
export function requireAdmin(user) {
  if (!user || !user.isAdmin) {
    const e = new Error('forbidden'); e.status = 403; throw e;
  }
  return user;
}
