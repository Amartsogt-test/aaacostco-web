/**
 * payments.js — Phase-3 payment confirmation (ported from functions/index.js
 * wireCallback + notifyOrderStage). On a verified payment we advance the order to
 * 'confirmed', credit the launch loyalty bonus (1-month-expiry lot), and recompute the
 * buyer's tier — all server-authoritative, on D1.
 *
 * POST /api/payments/wire/callback   (Wire.mn webhook; HMAC-signed)
 *   ⚠️ Re-point the Wire.mn webhook here and set:  wrangler secret put WIRE_WEBHOOK_SECRET
 */

const enc = new TextEncoder();
const QUALIFYING = ['confirmed', 'purchased', 'warehouse', 'shipped', 'customs', 'arrived_ub', 'out_for_delivery', 'delivered'];

async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function safeEq(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/**
 * The notifyOrderStage 'confirmed' side effects: launch loyalty bonus + tier recompute.
 * Idempotent via pointsCredited. `order` is the freshly-read order row.
 */
export async function onOrderConfirmed(env, order) {
  const userId = order.userId;
  if (!userId || String(userId).startsWith('guest-')) return;
  const audit = (() => { try { return JSON.parse(order.priceAudit || '{}'); } catch { return {}; } })();
  const goodsKRW = Number(audit.serverSubtotalKRW) || 0;

  // 🎉 Launch bonus (idempotent).
  if (order.launchSale && !order.pointsCredited) {
    const s = await env.DB.prepare("SELECT data FROM settings WHERE id = 'general'").first();
    let pct = 0; try { const g = JSON.parse(s?.data || '{}'); pct = Number(g.launchSale?.percent ?? g.launchSale?.pointsPercent) || 0; } catch { /* 0 */ }
    const pointsKRW = Math.max(0, Math.round(goodsKRW * pct / 100));
    if (pointsKRW > 0) {
      const u = await env.DB.prepare('SELECT loyaltyLots, loyaltyPointsKRW FROM users WHERE uid = ?').bind(userId).first();
      let lots = []; try { lots = JSON.parse(u?.loyaltyLots || '[]'); } catch { lots = []; }
      const nowD = new Date(); const exp = new Date(nowD); exp.setMonth(exp.getMonth() + 1);
      lots.push({ krw: pointsKRW, creditedAt: nowD.toISOString(), expiresAt: exp.toISOString(), orderId: order.id });
      const bal = (Number(u?.loyaltyPointsKRW) || 0) + pointsKRW;
      await env.DB.prepare('UPDATE users SET loyaltyLots = ?, loyaltyPointsKRW = ? WHERE uid = ?').bind(JSON.stringify(lots), bal, userId).run();
    }
    await env.DB.prepare('UPDATE orders SET pointsCredited = 1, pointsCreditedKRW = ? WHERE id = ?').bind(pointsKRW, order.id).run();
  }

  // 🏆 Tier recompute from server-authoritative goods value across qualifying orders.
  const { results } = await env.DB.prepare('SELECT trackingStage, priceAudit FROM orders WHERE userId = ?').bind(userId).all();
  let totalKRW = 0;
  for (const o of results || []) {
    if (!QUALIFYING.includes(o.trackingStage)) continue;
    try { totalKRW += Number(JSON.parse(o.priceAudit || '{}').serverSubtotalKRW) || 0; } catch { /* skip */ }
  }
  const tier = totalKRW >= 20000000 ? 'Platinum' : totalKRW >= 10000000 ? 'Gold' : 'Silver';
  await env.DB.prepare('UPDATE users SET totalSpendKRW = ?, tier = ? WHERE uid = ?').bind(totalKRW, tier, userId).run();
}

/** Advance an order received→confirmed (paid), confirm any split-shipment siblings, and run confirm side effects. */
export async function confirmOrder(env, orderId, note, paidAmount = 0) {
  const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first();
  if (!o) return false;
  const expectedAmount = Math.round(Number(o.amountPaid || o.total || 0));
  if (expectedAmount > 0 && paidAmount > 0 && paidAmount < expectedAmount) {
    console.error('confirmOrder rejected underpayment:', { orderId, paidAmount, expectedAmount });
    return false;
  }
  const now = new Date().toISOString();
  const noteStr = typeof note === 'string' ? note : (note?.provider || 'Онлайн төлбөр баталгаажсан');
  if ((o.trackingStage || 'received') === 'received') {
    const history = [
      { stage: 'received', label: 'Захиалга хүлээн авсан', note: '', timestamp: o.createdAt || o.date || now },
      { stage: 'confirmed', label: 'Захиалга баталгаажсан', note: noteStr, timestamp: now },
    ];
    await env.DB.prepare("UPDATE orders SET trackingStage = 'confirmed', status = 'Shipped', trackingHistory = ?, wire = json_set(COALESCE(wire,'{}'), '$.paid', json('true'), '$.paidAt', ?) WHERE id = ?")
      .bind(JSON.stringify(history), now, orderId).run();
  }
  const fresh = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first();
  await onOrderConfirmed(env, fresh);

  // If this order is part of a multi-parcel customs split (shipmentGroup), confirm all sibling parcels too!
  if (o.shipmentGroup) {
    const { results: siblings } = await env.DB.prepare(
      "SELECT * FROM orders WHERE shipmentGroup = ? AND id != ? AND trackingStage = 'received'"
    ).bind(o.shipmentGroup, orderId).all();
    for (const sib of siblings || []) {
      const sibHistory = [
        { stage: 'received', label: 'Захиалга хүлээн авсан', note: '', timestamp: sib.createdAt || sib.date || now },
        { stage: 'confirmed', label: 'Захиалга баталгаажсан', note: `${noteStr} (Багц #${orderId})`, timestamp: now },
      ];
      await env.DB.prepare(
        "UPDATE orders SET trackingStage = 'confirmed', status = 'Shipped', trackingHistory = ?, wire = json_set(COALESCE(wire,'{}'), '$.paid', json('true'), '$.paidAt', ?, '$.paidViaOrderId', ?) WHERE id = ?"
      ).bind(JSON.stringify(sibHistory), now, orderId, sib.id).run();
      const freshSib = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(sib.id).first();
      if (freshSib) await onOrderConfirmed(env, freshSib);
    }
  }
  return true;
}

/**
 * POST /api/payments/wire/create  { orderId, amount } → { qr, intentId }
 * Creates a Wire.mn payment intent, confirms with the qpay operator to get the QR, and
 * stamps wire{} on the order. The webhook (above) confirms the order once paid.
 * Requires secret WIRE_SECRET_KEY; WIRE_BASE_URL/WIRE_OPERATORS are vars.
 */
export async function createWireInvoice(body, env) {
  const orderId = (body?.orderId || '').toString().trim();
  if (!orderId) return { status: 400, data: { error: 'Захиалгын дугаар буруу байна.' } };

  const order = await env.DB.prepare('SELECT id, total, amountPaid, status, trackingStage, wire FROM orders WHERE id = ?')
    .bind(orderId).first();
  if (!order) return { status: 404, data: { error: 'Захиалга олдсонгүй.' } };
  if (order.status === 'Cancelled' || order.trackingStage === 'cancelled') {
    return { status: 400, data: { error: 'Цуцлагдсан захиалга байна.' } };
  }

  // Always use the server-stored order amount (never allow a lower client-supplied amount).
  const storedAmount = Math.round(Number(order.amountPaid || order.total || 0));
  const clientAmount = Math.round(Number(body?.amount) || 0);
  const amount = storedAmount > 0 ? storedAmount : clientAmount;
  if (amount <= 0) return { status: 400, data: { error: 'Төлбөрийн дүн буруу байна.' } };

  const apiKey = env.WIRE_SECRET_KEY;
  if (!apiKey) return { status: 503, data: { error: 'Wire.mn түлхүүр тохируулаагүй байна.' } };
  const base = env.WIRE_BASE_URL || 'https://api.wire.mn/v1';
  const operators = (env.WIRE_OPERATORS || 'qpay').split(',').map((s) => s.trim()).filter(Boolean);

  const r = await fetch(`${base}/payment_intents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, 'Idempotency-Key': orderId },
    body: JSON.stringify({ amount, currency: 'MNT', allowed_operators: operators, description: `Захиалга #${orderId}`, metadata: { orderId } }),
  });
  if (!r.ok) { console.error('Wire intent error:', await r.text()); return { status: 502, data: { error: 'Wire.mn нэхэмжлэх үүсгэж чадсангүй.' } }; }
  const inv = await r.json();

  const cr = await fetch(`${base}/payment_intents/${inv.id}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, 'Idempotency-Key': `${orderId}_confirm` },
    body: JSON.stringify({ operator: 'qpay', return_url: 'https://costco.mn/orders' }),
  });
  if (!cr.ok) { console.error('Wire confirm error:', await cr.text()); return { status: 502, data: { error: 'Wire.mn QPay баталгаажсангүй.' } }; }
  const confirmData = await cr.json();

  await env.DB.prepare("UPDATE orders SET wire = ?, paymentMethod = 'wire' WHERE id = ?")
    .bind(JSON.stringify({ intentId: inv.id || orderId, amount, paid: false, createdAt: new Date().toISOString() }), orderId).run();

  return { status: 200, data: { qr: confirmData.next_action?.qr, intentId: inv.id, amount } };
}

/** POST /api/payments/wire/callback — Wire.mn webhook (HMAC-signed). */
export async function wireCallback(request, env, rawBody) {
  const secret = env.WIRE_WEBHOOK_SECRET;
  if (!secret) return { status: 503, data: 'Webhook not configured' };

  const sigHeader = request.headers.get('wirepayment-signature') || '';
  const pairs = sigHeader.split(',').map((s) => s.trim().split('='));
  const t = pairs.find((p) => p[0] === 't')?.[1];
  const v1 = pairs.find((p) => p[0] === 'v1')?.[1];
  if (!t || !v1) return { status: 400, data: 'Invalid signature format' };
  if (Math.floor(Date.now() / 1000) - parseInt(t, 10) > 300) return { status: 400, data: 'Expired' };
  const expected = await hmacHex(secret, `${t}.${rawBody}`);
  if (!safeEq(expected, v1)) return { status: 400, data: 'Invalid signature' };

  let event; try { event = JSON.parse(rawBody); } catch { return { status: 200, data: 'OK' }; }
  if (event?.type === 'endpoint.verification') return { status: 200, data: 'OK' };
  if (event?.type === 'payment_intent.succeeded' || event?.type === 'charge.succeeded') {
    const obj = event?.data?.object || event?.data?.payment_intent || event?.data || {};
    let orderId = obj?.metadata?.orderId || event?.data?.metadata?.orderId || obj?.orderId;
    let intentId = obj?.id || obj?.payment_intent || event?.data?.id;
    const paidAmount = Math.round(Number(obj?.amount || obj?.amount_received || event?.data?.amount || 0));
    if (!orderId && !intentId) { const m = rawBody.match(/pi_[A-Za-z0-9]+/); if (m) intentId = m[0]; }
    if (!orderId && intentId) {
      const row = await env.DB.prepare("SELECT id FROM orders WHERE json_extract(wire, '$.intentId') = ? LIMIT 1")
        .bind(intentId).first();
      orderId = row?.id;
    }
    if (orderId) await confirmOrder(env, orderId, 'Онлайн төлбөр (Wire) амжилттай.', paidAmount);
    else console.error('wireCallback: could not resolve orderId', { intentId, keys: Object.keys(obj || {}) });
  }
  return { status: 200, data: 'OK' };
}
