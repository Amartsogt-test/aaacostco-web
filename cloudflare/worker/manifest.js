/**
 * manifest.js — Phase-4 daily customs manifest (ported from functions/index.js
 * dailyManifest). Builds a CSV of the last 24h of (non-cancelled) orders from D1,
 * stores it in daily_manifests (id = YYYY-MM-DD), and pushes the admins.
 *
 * Note vs Firebase: D1 products don't carry hsCode/costPriceKRW, so those columns are
 * left blank / sell-price based. Everything else (recipient, contents, weight, tax) is
 * computed the same way.
 */

import { sendPush, adminTokens } from './fcm.js';

const THRESHOLD_MNT = 660000;   // de-minimis split threshold
const SAME_ITEM_LIMIT = 2;      // >2 of one item ⇒ taxable
const DUTY_RATE = 5, VAT_RATE = 10;

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function getWonRate(env) {
  const r = await env.DB.prepare("SELECT data FROM settings WHERE id = 'currency'").first();
  try { return Number(JSON.parse(r?.data || '{}').wonRate) || 0; } catch { return 0; }
}

/** Build the manifest CSV + summary from order rows (each with .items[]) and a product map. */
function buildCsv(orders, productsById, wonRate) {
  const look = (it) => (it && productsById.get(it.product_id)) || null;
  const descOf = (it) => (look(it)?.englishName) || it?.name || 'Goods';
  const headers = ['№', 'Захиалга', 'Хүлээн авагч', 'Регистр', 'Утас', 'Хаяг', 'Бараа', 'Тоо', 'Үнэ_KRW', 'Жин_кг', 'Татвар', 'Татвар_дүн_₮', 'Tracking'];
  let taxableCount = 0;

  const rows = orders.map((order, i) => {
    const items = order.items || [];
    const krw = items.reduce((a, it) => a + (Number(it.price) || 0) * (Number(it.quantity) || 0), 0);
    const mnt = krw * (wonRate > 0 ? wonRate : 0);
    const qty = items.reduce((a, it) => a + (Number(it.quantity) || 0), 0);
    const net = items.reduce((a, it) => a + ((Number(look(it)?.weight) || 0) * (Number(it.quantity) || 0)), 0);
    const maxSame = items.reduce((m, it) => Math.max(m, Number(it.quantity) || 0), 0);
    const taxable = mnt > THRESHOLD_MNT || maxSame > SAME_ITEM_LIMIT;
    if (taxable) taxableCount++;
    const duty = taxable ? mnt * DUTY_RATE / 100 : 0;
    const tax = taxable ? duty + (mnt + duty) * VAT_RATE / 100 : 0;
    const contents = items.map((it) => `${descOf(it)} x${Number(it.quantity) || 0}`).join('; ');
    const customsAddress = order.recipientCustomsAddress || order.recipientAddress || '';
    return [i + 1, order.id, order.recipientName || order.customer || '', order.recipientRegister || '',
      order.recipientPhone || '', customsAddress, contents,
      qty, Math.round(krw), net ? net.toFixed(2) : '', taxable ? 'Татвартай' : 'Татваргүй',
      taxable ? Math.round(tax) : '', order.trackingNumber || ''];
  });

  const csv = '﻿' + [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  return { csv, taxableCount };
}

/** Generate, store, and announce the daily manifest. Returns { date, count, taxableCount }. */
export async function generateDailyManifest(env) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { results: orderRows } = await env.DB.prepare(
    "SELECT * FROM orders WHERE createdAt >= ? AND status != 'Cancelled' AND status != 'deleted' AND trackingStage NOT IN ('received', 'cancelled') ORDER BY createdAt"
  ).bind(cutoff).all();
  const orders = orderRows || [];
  const dateStr = new Date().toISOString().slice(0, 10);
  if (orders.length === 0) return { date: dateStr, count: 0, taxableCount: 0 };

  // Attach items per order using batched IN (...) queries instead of N+1.
  const orderIds = orders.map((o) => o.id).filter(Boolean);
  const itemsByOrder = new Map();
  for (let i = 0; i < orderIds.length; i += 50) {
    const chunk = orderIds.slice(i, i + 50);
    const ph = chunk.map(() => '?').join(',');
    const { results } = await env.DB.prepare(
      `SELECT order_id, product_id, name, price, quantity FROM order_items WHERE order_id IN (${ph})`
    ).bind(...chunk).all();
    for (const it of results || []) {
      const arr = itemsByOrder.get(it.order_id) || [];
      arr.push(it);
      itemsByOrder.set(it.order_id, arr);
    }
  }
  for (const o of orders) {
    o.items = itemsByOrder.get(o.id) || [];
  }

  // Look up only referenced products (weight / englishName).
  const ids = [...new Set(orders.flatMap((o) => o.items.map((it) => it.product_id).filter(Boolean)))];
  const productsById = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    if (!chunk.length) break;
    const ph = chunk.map(() => '?').join(',');
    const { results } = await env.DB.prepare(`SELECT id, englishName, weight FROM products WHERE id IN (${ph})`).bind(...chunk).all();
    for (const p of results || []) productsById.set(p.id, p);
  }

  const wonRate = await getWonRate(env);
  const { csv, taxableCount } = buildCsv(orders, productsById, wonRate);

  await env.DB.prepare('INSERT OR REPLACE INTO daily_manifests (id, data) VALUES (?, ?)')
    .bind(dateStr, JSON.stringify({ date: dateStr, count: orders.length, taxableCount, csv, createdAt: new Date().toISOString() })).run();

  // Announce to admins (no-op without FCM creds).
  try {
    await sendPush(env, await adminTokens(env), {
      title: 'Өдрийн manifest бэлэн',
      body: `${orders.length} илгээмж${taxableCount ? ` • ${taxableCount} татвартай` : ''}`,
      url: '/admin/daily-manifests',
    });
  } catch (e) { console.error('manifest push failed:', e); }

  return { date: dateStr, count: orders.length, taxableCount };
}

/** GET /api/admin/manifests — recent manifests (id + summary; admin downloads the CSV). */
export async function listManifests(env) {
  const { results } = await env.DB.prepare('SELECT id, data FROM daily_manifests ORDER BY id DESC LIMIT 60').all();
  const manifests = (results || []).map((r) => { try { return JSON.parse(r.data); } catch { return { date: r.id }; } });
  return { status: 200, data: { manifests } };
}
