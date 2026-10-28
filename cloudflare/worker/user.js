/**
 * user.js — Phase-3 user profile writes (saved addresses, profile, FCM push tokens),
 * replacing the client's direct Firestore users/{uid} writes (AddressManager, authStore,
 * pushService). Only the owner (JWT) can update their own record.
 *
 *   GET  /api/user            (authed) — full profile incl. addresses
 *   POST /api/user  { name?, phone?, addresses?, followStatus?, fcmToken? }  (authed)
 */

export async function getUser(env, user) {
  if (!user?.uid) return { status: 401, data: { error: 'unauthenticated' } };
  const r = await env.DB.prepare('SELECT uid, phone, name, email, isAdmin, tier, totalSpendKRW, loyaltyPointsKRW, loyaltyLots, addresses, followStatus FROM users WHERE uid = ?')
    .bind(user.uid).first();
  if (!r) return { status: 404, data: { error: 'not found' } };
  const parse = (v, fb) => { try { return v ? JSON.parse(v) : fb; } catch { return fb; } };
  return {
    status: 200,
    data: {
      user: {
        ...r, isAdmin: !!r.isAdmin,
        loyaltyLots: parse(r.loyaltyLots, []), addresses: parse(r.addresses, []), followStatus: parse(r.followStatus, null),
      },
    },
  };
}

export async function updateUser(body, env, user) {
  if (!user?.uid) return { status: 401, data: { error: 'unauthenticated' } };
  const sets = [], args = [];
  if (body.name !== undefined) { sets.push('name = ?'); args.push(body.name); }
  // NOTE: `phone` is intentionally NOT editable here. It is the account's verified login
  // identity (set only by SMS verify) and orders are surfaced by recipientPhone tail — so
  // letting a user overwrite their phone would expose another person's orders. Per-order
  // recipient phone is captured separately at checkout.
  if (body.addresses !== undefined) { sets.push('addresses = ?'); args.push(JSON.stringify(body.addresses)); }
  if (body.followStatus !== undefined) { sets.push('followStatus = ?'); args.push(JSON.stringify(body.followStatus)); }
  if (body.fcmToken) {
    const r = await env.DB.prepare('SELECT fcmTokens FROM users WHERE uid = ?').bind(user.uid).first();
    let toks = []; try { toks = JSON.parse(r?.fcmTokens || '[]'); } catch { toks = []; }
    if (!toks.includes(body.fcmToken)) toks.push(body.fcmToken);
    sets.push('fcmTokens = ?'); args.push(JSON.stringify(toks));
  }
  if (!sets.length) return { status: 200, data: { ok: true } };
  args.push(user.uid);
  await env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE uid = ?`).bind(...args).run();
  return { status: 200, data: { ok: true } };
}
