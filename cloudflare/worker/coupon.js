/**
 * coupon.js — Phase-3 coupon validation (ported from functions/index.js validateCoupon).
 * Public (no auth): the client computes the actual discount in display currency.
 *
 *   POST /api/coupon/validate  { code, subtotalMNT } → { code, type, value, minOrderMNT } | error
 */
/**
 * checkCoupon — authoritative eligibility check. Returns { ok, coupon } or { ok:false,
 * error }. Reused by the public validate endpoint AND by createOrder (re-validation at
 * order time, so a dead/expired/over-cap/under-min coupon can't be applied by crafting
 * the order body or via an apply→checkout race).
 */
export async function checkCoupon(env, code, subtotalMNT) {
  const C = (code || '').toString().trim().toUpperCase();
  if (!C) return { ok: false, error: 'Кодоо оруулна уу.' };
  const c = await env.DB.prepare('SELECT * FROM coupons WHERE code = ?').bind(C).first();
  if (!c) return { ok: false, error: 'Купон олдсонгүй.' };
  if (c.active === 0) return { ok: false, error: 'Купон идэвхгүй байна.' };
  if (c.expiresAt && new Date(c.expiresAt).getTime() < Date.now()) return { ok: false, error: 'Купоны хугацаа дууссан.' };
  if (c.minOrderMNT && Math.round(Number(subtotalMNT) || 0) < Number(c.minOrderMNT)) {
    return { ok: false, error: `Хамгийн багадаа ${Number(c.minOrderMNT).toLocaleString()}₮-ийн захиалга шаардлагатай.` };
  }
  if (c.cap != null && Number(c.used) >= Number(c.cap)) return { ok: false, error: 'Купоны ашиглалтын хязгаар дууссан.' };
  return { ok: true, coupon: c };
}

/** Max discount (MNT) a coupon may grant for a given pre-discount goods value. */
export function couponDiscountMNT(coupon, baseMNT) {
  const base = Math.max(0, Math.round(Number(baseMNT) || 0));
  if (coupon.type === 'fixed') return Math.max(0, Math.round(Number(coupon.value) || 0));
  return Math.round(base * (Number(coupon.value) || 0) / 100);
}

export async function validateCoupon(body, env) {
  const r = await checkCoupon(env, body?.code, body?.subtotalMNT);
  if (!r.ok) return { status: 400, data: { error: r.error } };
  const c = r.coupon;
  return { status: 200, data: { code: c.code, type: c.type, value: c.value, minOrderMNT: c.minOrderMNT } };
}
