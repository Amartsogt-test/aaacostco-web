/**
 * sms-auth.js — Phase-2 SMS login (ported from functions/index.js requestSmsCode /
 * smsWebhook / verifySmsCode), on D1 + the JWT session foundation (auth.js).
 *
 * Flow (no outbound SMS API needed): user asks for a code → we store it (sms_codes) and
 * show the business number → user TEXTS that code from their phone → the SMS gateway
 * POSTs it to /webhook (secret-gated) which marks the code verified → user's client polls
 * /verify which, once verified, upserts the user in D1 and issues a JWT session.
 *
 * ⚠️ Re-point the SMS gateway (Android app) at the Worker webhook URL:
 *      https://costco-api.<sub>.workers.dev/api/auth/sms/webhook
 *    and set the secret:  wrangler secret put SMS_WEBHOOK_SECRET
 *
 * Each handler returns { status, data } — index.js wraps it in a JSON Response.
 */
import { createSession } from './auth.js';

const TTL_MS = 5 * 60 * 1000;          // code valid 5 minutes
const RATE_MS = 60 * 1000;             // 1 request / phone / minute
const BUSINESS_NUMBER = '60649999';
const TEST_PHONE = '95550011';
const TEST_CODE = '888';

const cleanPhone = (p) => (p || '').toString().replace(/\D/g, '');
const tail8 = (s) => (s || '').slice(-8);

// constant-time-ish string compare
function safeEq(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** POST /api/auth/sms/request  { phone } */
export async function smsRequest(body, env) {
  const rawDigits = cleanPhone(body?.phone);
  if (rawDigits.length < 8) return { status: 400, data: { error: 'Утасны дугаар буруу байна.' } };
  const phone = tail8(rawDigits);
  const now = Date.now();
  const sessionId = `sms_${phone}_${now}`;
  const expiresAt = new Date(now + TTL_MS).toISOString();

  // Test account: only enabled if explicitly allowed via ALLOW_TEST_PHONE='true' env var.
  if (env.ALLOW_TEST_PHONE === 'true' && phone === TEST_PHONE) {
    await env.DB.prepare('INSERT OR REPLACE INTO sms_codes (sessionId, phone, code, verified, expiresAt, createdAt) VALUES (?,?,?,?,?,?)')
      .bind(sessionId, phone, TEST_CODE, 1, expiresAt, new Date(now).toISOString()).run();
    return { status: 200, data: { sessionId, code: TEST_CODE, businessNumber: BUSINESS_NUMBER } };
  }

  // Rate limit: 1 per phone per minute.
  const recent = await env.DB.prepare('SELECT 1 FROM sms_codes WHERE phone = ? AND createdAt > ? LIMIT 1')
    .bind(phone, new Date(now - RATE_MS).toISOString()).first();
  if (recent) return { status: 429, data: { error: 'Та 1 минут хүлээнэ үү.' } };

  // Cryptographically random 6-digit code.
  const rand = new Uint32Array(1);
  crypto.getRandomValues(rand);
  const code = String(100000 + (rand[0] % 900000));
  await env.DB.prepare('INSERT OR REPLACE INTO sms_codes (sessionId, phone, code, verified, expiresAt, createdAt) VALUES (?,?,?,?,?,?)')
    .bind(sessionId, phone, code, 0, expiresAt, new Date(now).toISOString()).run();
  return { status: 200, data: { sessionId, code, businessNumber: BUSINESS_NUMBER } };
}

/** POST /api/auth/sms/webhook  { from, body, secret }  (called by the SMS gateway) */
export async function smsWebhook(body, env) {
  const secret = env.SMS_WEBHOOK_SECRET;
  if (!secret) return { status: 503, data: { error: 'not configured' } };
  if (!safeEq(body?.secret, secret)) return { status: 403, data: { error: 'forbidden' } };

  const senderPhone = cleanPhone(body?.from);
  const smsBody = (body?.body || '').toString().trim();
  if (!senderPhone || !smsBody) return { status: 400, data: { error: 'missing from/body' } };

  // Match a pending code: same code, unverified, unexpired, phone tail matches.
  const { results } = await env.DB.prepare(
    'SELECT sessionId, phone FROM sms_codes WHERE code = ? AND verified = 0 AND expiresAt > ? LIMIT 10'
  ).bind(smsBody, new Date().toISOString()).all();
  for (const row of results || []) {
    if (tail8(row.phone) === tail8(senderPhone)) {
      await env.DB.prepare('UPDATE sms_codes SET verified = 1 WHERE sessionId = ?').bind(row.sessionId).run();
      break;
    }
  }
  return { status: 200, data: { ok: true } };  // always 200 so the gateway doesn't retry
}

/** POST /api/auth/sms/verify  { sessionId }  → { pending } or { token, user } */
export async function smsVerify(body, env) {
  const sessionId = (body?.sessionId || '').toString();
  if (!sessionId) return { status: 400, data: { error: 'sessionId шаардлагатай.' } };
  const row = await env.DB.prepare('SELECT phone, verified, expiresAt FROM sms_codes WHERE sessionId = ?')
    .bind(sessionId).first();
  if (!row) return { status: 404, data: { error: 'Session олдсонгүй.' } };
  if (new Date(row.expiresAt).getTime() < Date.now()) return { status: 410, data: { error: 'Кодын хугацаа дууссан.' } };
  if (!row.verified) return { status: 200, data: { pending: true } };

  // Verified → find existing user by phone (preserve their uid/orders/loyalty) or create.
  const phone8 = tail8(cleanPhone(row.phone));
  const fullPhone = `+976${phone8}`;
  let user = await env.DB.prepare(
    'SELECT uid, phone, name, email, isAdmin, tier, loyaltyPointsKRW, loginProvider, registrationMethod FROM users WHERE phone = ? OR phone = ? LIMIT 1'
  ).bind(fullPhone, phone8).first();
  if (!user) {
    const uid = crypto.randomUUID();
    const nowISO = new Date().toISOString();
    await env.DB.prepare(
      'INSERT INTO users (uid, phone, name, isAdmin, loginProvider, registrationMethod, createdAt, lastLogin) VALUES (?,?,?,?,?,?,?,?)'
    ).bind(uid, fullPhone, null, 0, 'sms', 'sms', nowISO, nowISO).run();
    user = { uid, phone: fullPhone, name: null, email: null, isAdmin: 0, tier: 'Silver', loyaltyPointsKRW: 0, loginProvider: 'sms', registrationMethod: 'sms' };
  } else {
    await env.DB.prepare("UPDATE users SET phone = ?, lastLogin = ?, loginProvider = COALESCE(loginProvider, 'sms') WHERE uid = ?")
      .bind(fullPhone, new Date().toISOString(), user.uid).run();
    user.phone = fullPhone;
  }
  // Delete the consumed OTP row so it cannot be replayed.
  await env.DB.prepare('DELETE FROM sms_codes WHERE sessionId = ?').bind(sessionId).run();
  const { token } = await createSession(env, user);
  return {
    status: 200,
    data: {
      token,
      user: {
        ...user,
        isAdmin: !!user.isAdmin,
        loginProvider: user.loginProvider || 'sms',
        registrationMethod: user.registrationMethod || 'sms',
      },
    },
  };
}
