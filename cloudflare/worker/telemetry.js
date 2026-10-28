/**
 * telemetry.js — Real-Time Error Telemetry & Edge Self-Healing Doctor.
 *
 * Responsibilities:
 *   1. Collects uncaught frontend (`ErrorBoundary.jsx`, `window.onerror`) and Worker 500
 *      errors into D1 (`settings` id = `'telemetry_errors'`), deduplicating by signature.
 *   2. Runs `autoHealEdgeSystem(env)` (called on cron and via `POST /api/admin/self-heal`):
 *      - Repairs active products missing `estimatedWarehousePrice`
 *      - Fixes inverted `originalPrice < price` discount anomalies
 *      - Auto-confirms orders where `wire` / `qpay` payment succeeded in JSON but
 *        `trackingStage` stayed `'received'`
 *      - Cleans up expired SMS auth sessions and stale carts
 */

import { notifyOwner } from './notify.js';
import { confirmOrder } from './payments.js';
import { requireAdmin } from './auth.js';

const MAX_STORED_ERRORS = 50;

/**
 * Record a frontend or backend error in D1 (`settings/telemetry_errors`).
 */
export async function recordTelemetryError(body, env) {
  const message = String(body?.message || 'Unknown error').slice(0, 500);
  const stack = String(body?.stack || '').slice(0, 1500);
  const source = String(body?.source || 'frontend').slice(0, 60);
  const url = String(body?.url || '').slice(0, 300);
  const signature = `${source}:${message.slice(0, 120)}`;
  const now = new Date().toISOString();

  try {
    const row = await env.DB.prepare("SELECT data FROM settings WHERE id = 'telemetry_errors'").first();
    const parsed = row?.data ? JSON.parse(row.data) : { errors: [] };
    const list = Array.isArray(parsed.errors) ? parsed.errors : [];

    const existing = list.find((e) => e.signature === signature);
    let isNewCritical = false;
    if (existing) {
      existing.count = (Number(existing.count) || 1) + 1;
      existing.lastSeen = now;
      if (stack) existing.stack = stack;
    } else {
      isNewCritical = true;
      list.unshift({
        id: crypto.randomUUID(),
        signature,
        source,
        message,
        stack,
        url,
        count: 1,
        status: 'open',
        firstSeen: now,
        lastSeen: now,
      });
    }

    const trimmed = list.slice(0, MAX_STORED_ERRORS);
    await env.DB.prepare(
      "INSERT OR REPLACE INTO settings (id, data, updatedAt) VALUES ('telemetry_errors', ?, ?)"
    ).bind(JSON.stringify({ errors: trimmed, updatedAt: now }), now).run();

    if (isNewCritical && source === 'worker-500') {
      await notifyOwner(env, {
        title: `Системийн алдаа илэрлээ (${source})`,
        body: `Алдаа: ${message}\nURL: ${url}`,
        level: 'warning',
      });
    }

    return { status: 200, data: { ok: true } };
  } catch (e) {
    console.error('recordTelemetryError failed:', e?.message);
    return { status: 200, data: { ok: false } };
  }
}

/**
 * GET /api/admin/telemetry — list recorded errors for the self-heal script & Admin UI.
 */
export async function getTelemetryErrors(env, user) {
  requireAdmin(user);
  const row = await env.DB.prepare("SELECT data FROM settings WHERE id = 'telemetry_errors'").first();
  const parsed = row?.data ? JSON.parse(row.data) : { errors: [] };
  return { status: 200, data: parsed };
}

/**
 * Autonomous Edge Self-Healing Doctor: repairs data anomalies in D1 automatically.
 */
export async function autoHealEdgeSystem(env) {
  const report = {
    healedWarehousePrices: 0,
    healedDiscountAnomalies: 0,
    healedStuckPaidOrders: 0,
    timestamp: new Date().toISOString(),
  };

  try {
    // 1. Repair active products where price > 0 but estimatedWarehousePrice is 0 or NULL
    const missingWh = await env.DB.prepare(
      `SELECT id, price FROM products
       WHERE status = 'active' AND price > 0 AND (estimatedWarehousePrice IS NULL OR estimatedWarehousePrice <= 0)
       LIMIT 200`
    ).all();
    const whStmts = [];
    for (const p of missingWh.results || []) {
      const price = Number(p.price) || 0;
      const markup = price > 100000 ? 0 : 2000;
      const whPrice = Math.max(0, price - markup);
      whStmts.push(
        env.DB.prepare('UPDATE products SET estimatedWarehousePrice = ?, estimatedMarkupKrw = ? WHERE id = ?')
          .bind(whPrice, markup, p.id)
      );
      report.healedWarehousePrices++;
    }
    for (let i = 0; i < whStmts.length; i += 50) {
      await env.DB.batch(whStmts.slice(i, i + 50));
    }

    // 2. Repair products where hasDiscount = 1 but originalPrice <= price
    const badDiscounts = await env.DB.prepare(
      `SELECT id, price FROM products
       WHERE hasDiscount = 1 AND (originalPrice IS NULL OR originalPrice <= price)
       LIMIT 200`
    ).all();
    const discStmts = (badDiscounts.results || []).map((p) =>
      env.DB.prepare('UPDATE products SET hasDiscount = 0, originalPrice = price WHERE id = ?').bind(p.id)
    );
    report.healedDiscountAnomalies = discStmts.length;
    for (let i = 0; i < discStmts.length; i += 50) {
      await env.DB.batch(discStmts.slice(i, i + 50));
    }

    // 3. Auto-confirm orders that have paid=true in wire/qpay JSON but trackingStage='received'
    const stuckOrders = await env.DB.prepare(
      `SELECT id, amountPaid, total, wire, qpay FROM orders
       WHERE trackingStage = 'received' AND status != 'Cancelled' AND (wire LIKE '%"paid":true%' OR qpay LIKE '%"paid":true%')
       LIMIT 50`
    ).all();
    for (const o of stuckOrders.results || []) {
      const paidAmt = Number(o.amountPaid) || Number(o.total) || 0;
      const ok = await confirmOrder(env, o.id, 'Auto-heal баталгаажуулалт', paidAmt);
      if (ok) report.healedStuckPaidOrders++;
    }
  } catch (e) {
    console.error('autoHealEdgeSystem error:', e?.message);
    report.error = e?.message;
  }

  return report;
}
