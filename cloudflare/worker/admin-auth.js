/**
 * admin-auth.js — Phase-2 admin login on the Worker (self-contained; no SMS gateway).
 *
 * Firebase Auth held the admin password hash, which can't be ported — so admins get a
 * NEW password on Cloudflare, hashed with PBKDF2-SHA256 (Web Crypto) and stored in the
 * D1 `settings` table at id='admin_auth' as JSON { phone, salt, hash, iterations }.
 *
 * Set it once with:  node cloudflare/set-admin-password.mjs   (emits SQL → wrangler d1)
 *
 * Login: POST /api/auth/admin/login { phone, password } → verifies, finds the admin user
 * (users.isAdmin=1) by phone, and issues a JWT session (auth.js createSession).
 */
import { createSession } from './auth.js';

const enc = new TextEncoder();
const ITER = 100000;
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** PBKDF2-SHA256(password, salt) → hex. `saltHex` is a hex string. */
export async function hashPassword(password, saltHex, iterations = ITER) {
  const salt = Uint8Array.from(saltHex.match(/.{2}/g).map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
  return toHex(bits);
}

function safeEqHex(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** POST /api/auth/admin/login  { phone, password } → { token, user } | error */
export async function adminLogin(body, env) {
  const phone = (body?.phone || '').toString().replace(/\D/g, '');
  const password = (body?.password || '').toString();
  if (!phone || !password) return { status: 400, data: { error: 'Утас/нууц үг шаардлагатай.' } };

  const row = await env.DB.prepare("SELECT data FROM settings WHERE id = 'admin_auth'").first();
  if (!row?.data) return { status: 403, data: { error: 'Admin тохиргоо байхгүй.' } };
  let cfg; try { cfg = JSON.parse(row.data); } catch { cfg = null; }
  if (!cfg?.salt || !cfg?.hash) return { status: 403, data: { error: 'Admin тохиргоо буруу.' } };

  // The configured admin phone must match (stored either as 8-digit or +976…).
  if (cfg.phone && cfg.phone.replace(/\D/g, '').slice(-8) !== phone.slice(-8)) {
    return { status: 403, data: { error: 'Нэвтрэх мэдээлэл буруу.' } };
  }

  const computed = await hashPassword(password, cfg.salt, cfg.iterations || ITER);
  if (!safeEqHex(computed, cfg.hash)) return { status: 403, data: { error: 'Нэвтрэх мэдээлэл буруу.' } };

  // Find the admin user (preserve their existing uid). Match phone tail; require isAdmin.
  const { results } = await env.DB.prepare('SELECT uid, phone, name, email, isAdmin, tier, loyaltyPointsKRW FROM users WHERE isAdmin = 1').all();
  const user = (results || []).find((u) => (u.phone || '').replace(/\D/g, '').slice(-8) === phone.slice(-8))
    || (results || [])[0];
  if (!user) return { status: 403, data: { error: 'Admin хэрэглэгч олдсонгүй.' } };

  await env.DB.prepare('UPDATE users SET lastLogin = ? WHERE uid = ?').bind(new Date().toISOString(), user.uid).run();
  const { token } = await createSession(env, { uid: user.uid, isAdmin: true });
  return { status: 200, data: { token, user: { ...user, isAdmin: true } } };
}
