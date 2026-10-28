/**
 * cron.js — Phase-4 scheduled maintenance, run by the Worker's Cron Trigger
 * (wrangler.toml [triggers] crons). Ports the critical Firebase onSchedule jobs to D1:
 *   • expireLoyaltyBonus    (loyalty lots past 1-month expiry)
 *   • dailyTierSync         (recompute lifetime spend + tier; self-heals drift)
 *   • abandonedCartReminder (nudge carts left ≥12h ago, once)
 *   • generateDailyManifest (customs CSV — see manifest.js)
 *   • purgeExpiredSmsCodes  (housekeeping)
 *
 * NOT ported (stay outside the Worker): dailyPriceFix (scraper pipeline) and
 * scheduledSearchIndexRebuild (obsolete — search is server-side on D1 now).
 *
 * Wired via the Worker's `scheduled()` handler (index.js).
 */

import { generateDailyManifest } from './manifest.js';
import { sendPush, userTokens, adminTokens } from './fcm.js';
import { backupToR2 } from './backup.js';
import { refundOrderBenefits } from './orders.js';

const TIER_QUALIFYING = ['confirmed', 'purchased', 'warehouse', 'shipped', 'customs', 'arrived_ub', 'out_for_delivery', 'delivered'];

/**
 * expireLoyaltyBonus — drop loyalty lots past their 1-month expiry and recompute the
 * aggregate balance. "Use it within a month or lose it." (Redemption also purges
 * opportunistically; this guarantees expiry even for inactive users.)
 */
export async function expireLoyaltyBonus(env) {
  const nowMs = Date.now();
  const { results } = await env.DB.prepare(
    "SELECT uid, loyaltyLots FROM users WHERE loyaltyLots IS NOT NULL AND loyaltyLots != '[]'"
  ).all();
  const stmts = [];
  for (const u of results || []) {
    let lots = []; try { lots = JSON.parse(u.loyaltyLots || '[]'); } catch { continue; }
    const keep = lots.filter((l) => l && new Date(l.expiresAt).getTime() > nowMs);
    if (keep.length === lots.length) continue;            // nothing expired
    const bal = keep.reduce((s, l) => s + (Number(l.krw) || 0), 0);
    stmts.push(
      env.DB.prepare('UPDATE users SET loyaltyLots = ?, loyaltyPointsKRW = ? WHERE uid = ?')
        .bind(JSON.stringify(keep), bal, u.uid)
    );
  }
  for (let i = 0; i < stmts.length; i += 50) {
    await env.DB.batch(stmts.slice(i, i + 50));
  }
  return { updated: stmts.length };
}

/**
 * purgeExpiredSmsCodes — clear ephemeral SMS verification rows older than their expiry
 * (housekeeping; the verify endpoint already rejects expired codes).
 */
export async function purgeExpiredSmsCodes(env) {
  const res = await env.DB.prepare('DELETE FROM sms_codes WHERE expiresAt < ?').bind(new Date().toISOString()).run();
  return { deleted: res?.meta?.changes ?? 0 };
}

/**
 * dailyTierSync — recompute every account's lifetime spend (₩) + tier from its orders.
 * onOrderConfirmed keeps active buyers current in real time; this nightly pass backfills
 * pre-feature users and self-heals drift. Server-authoritative goods value, qualifying
 * stages only. (Mirrors functions/index.js dailyTierSync.)
 */
export async function dailyTierSync(env) {
  // 1. Bucket spend by user from a single orders read.
  const { results: orders } = await env.DB.prepare('SELECT userId, trackingStage, priceAudit FROM orders').all();
  const spendByUser = new Map();
  for (const o of orders || []) {
    if (!o.userId || String(o.userId).startsWith('guest-')) continue;
    if (!TIER_QUALIFYING.includes(o.trackingStage)) continue;
    let krw = 0; try { krw = Number(JSON.parse(o.priceAudit || '{}').serverSubtotalKRW) || 0; } catch { /* 0 */ }
    spendByUser.set(o.userId, (spendByUser.get(o.userId) || 0) + krw);
  }

  // 2. Update only users whose tier/spend changed using D1 batching.
  const { results: users } = await env.DB.prepare('SELECT uid, totalSpendKRW, tier FROM users').all();
  const stmts = [];
  for (const u of users || []) {
    const totalKRW = Math.round(spendByUser.get(u.uid) || 0);
    const tier = totalKRW >= 20000000 ? 'Platinum' : totalKRW >= 10000000 ? 'Gold' : 'Silver';
    if (Number(u.totalSpendKRW || 0) === totalKRW && u.tier === tier) continue;
    stmts.push(
      env.DB.prepare('UPDATE users SET totalSpendKRW = ?, tier = ? WHERE uid = ?').bind(totalKRW, tier, u.uid)
    );
  }
  for (let i = 0; i < stmts.length; i += 50) {
    await env.DB.batch(stmts.slice(i, i + 50));
  }
  return { updated: stmts.length };
}

/**
 * abandonedCartReminder — nudge shoppers who left items in their cart ≥12h ago, once per
 * abandonment.
 */
export async function abandonedCartReminder(env) {
  const cutoff = Date.now() - 12 * 60 * 60 * 1000;
  const { results } = await env.DB.prepare('SELECT userId, items, updatedAt FROM carts').all();
  const stmts = [];
  for (const row of results || []) {
    let c = {}; try { c = JSON.parse(row.items || '{}'); } catch { continue; }
    if (!c.itemCount || c.itemCount <= 0 || c.reminded) continue;
    if (row.updatedAt && new Date(row.updatedAt).getTime() > cutoff) continue; // too recent
    const body = `Таны сагсанд ${c.itemCount} бараа хүлээж байна. Захиалгаа дуусгаарай!`;
    try { await sendPush(env, await userTokens(env, row.userId), { title: 'Сагсаа мартсан уу?', body, url: '/cart' }); } catch { /* ignore */ }
    stmts.push(
      env.DB.prepare('UPDATE carts SET items = ? WHERE userId = ?')
        .bind(JSON.stringify({ ...c, reminded: true, remindedAt: new Date().toISOString() }), row.userId)
    );
  }
  for (let i = 0; i < stmts.length; i += 50) {
    await env.DB.batch(stmts.slice(i, i + 50));
  }
  return { reminded: stmts.length };
}

/**
 * cancelAbandonedOrders — auto-cancel online (Wire) orders that were created but never
 * paid after 24h.
 */
export async function cancelAbandonedOrders(env) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT id, userId, trackingHistory, shipmentGroup, pointsRedeemedKRW, couponCode, priceAudit FROM orders
       WHERE trackingStage = 'received' AND paymentMethod = 'wire' AND createdAt < ?
         AND (wire IS NULL OR COALESCE(json_extract(wire, '$.paid'), 0) != 1)
         AND (shipmentGroup IS NULL OR shipmentGroup NOT IN (
           SELECT shipmentGroup FROM orders WHERE shipmentGroup IS NOT NULL AND trackingStage NOT IN ('received', 'cancelled')
         ))`
  ).bind(cutoff).all();
  const stmts = [];
  const now = new Date().toISOString();
  for (const o of results || []) {
    let prev = []; try { prev = JSON.parse(o.trackingHistory || '[]'); } catch { prev = []; }
    const history = [...prev.filter((e) => e.stage !== 'cancelled'),
      { stage: 'cancelled', label: 'Цуцлагдсан', note: 'Төлбөр төлөгдөөгүй (24 цаг)', timestamp: now }];
    stmts.push(
      env.DB.prepare("UPDATE orders SET trackingStage = 'cancelled', status = 'Cancelled', trackingHistory = ? WHERE id = ?")
        .bind(JSON.stringify(history), o.id)
    );
  }
  for (let i = 0; i < stmts.length; i += 50) {
    await env.DB.batch(stmts.slice(i, i + 50));
  }
  for (const o of results || []) {
    try { await refundOrderBenefits(env, o); } catch (e) { console.error('refundOrderBenefits failed:', o.id, e); }
  }
  return { cancelled: stmts.length };
}

import { autoHealEdgeSystem } from './telemetry.js';
import { sendDailyExecutiveReport } from './notify.js';

/**
 * Entry point called by the Worker scheduled() handler. Each job is isolated so one
 * failure can't abort the rest; failures are logged AND pushed to admins (free, via FCM)
 * so a silently-broken cron gets noticed.
 */
export async function runScheduled(env) {
  const jobs = {
    selfHeal: autoHealEdgeSystem,
    loyalty: expireLoyaltyBonus,
    tiers: dailyTierSync,
    carts: abandonedCartReminder,
    abandonedOrders: cancelAbandonedOrders,
    manifest: generateDailyManifest,
    backup: backupToR2,
    smsPurge: purgeExpiredSmsCodes,
    executiveReport: sendDailyExecutiveReport,
  };
  const summary = {}; const failed = [];
  for (const [name, fn] of Object.entries(jobs)) {
    try { summary[name] = await fn(env); }
    catch (e) { failed.push(name); summary[name] = { error: String(e?.message || e) }; console.error(`cron ${name} failed:`, e); }
  }
  console.log('cron summary:', JSON.stringify(summary));

  if (failed.length) {
    try {
      await sendPush(env, await adminTokens(env), {
        title: '⚠️ Cron алдаа', body: `Амжилтгүй: ${failed.join(', ')}`, url: '/admin',
      });
    } catch (e) { console.error('cron alert push failed:', e); }
  }
  return summary;
}
