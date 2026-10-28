/**
 * cart.js — Phase-3 cart sync (replaces utils/cartSync.js Firestore writes).
 * Stores a lightweight snapshot for the abandoned-cart reminder (Phase-4 cron).
 *
 *   POST /api/cart  { itemCount }   (authed)
 *   GET  /api/cart                  (authed) — optional read-back
 */

export async function saveCart(body, env, user) {
  if (!user?.uid) return { status: 401, data: { error: 'unauthenticated' } };
  const itemCount = Math.max(0, Number(body?.itemCount) || 0);
  if (itemCount > 0) {
    await env.DB.prepare('INSERT OR REPLACE INTO carts (userId, items, updatedAt) VALUES (?,?,?)')
      .bind(user.uid, JSON.stringify({ itemCount, reminded: false }), new Date().toISOString()).run();
  } else {
    await env.DB.prepare('DELETE FROM carts WHERE userId = ?').bind(user.uid).run();
  }
  return { status: 200, data: { ok: true } };
}

export async function getCart(env, user) {
  if (!user?.uid) return { status: 401, data: { error: 'unauthenticated' } };
  const r = await env.DB.prepare('SELECT items FROM carts WHERE userId = ?').bind(user.uid).first();
  let cart = null; try { cart = r?.items ? JSON.parse(r.items) : null; } catch { cart = null; }
  return { status: 200, data: { cart } };
}
