/**
 * orders.js — Phase-3 order write path (ported from functions/index.js createOrder).
 *
 * Server-authoritative, on D1: mints a clean order id, stamps the authenticated uid,
 * runs the price-audit (pulls each item's real price from D1 — flags forged/low prices,
 * over-qty, unknown products), atomically redeems loyalty (≤50% of goods value, oldest
 * non-expired lots first), then writes the order + order_items and seeds the tracking
 * timeline. Requires a logged-in user (JWT) for loyalty redemption.
 *
 * POST /api/orders  { order }  →  { id, userId } | error
 */

import { checkCoupon, couponDiscountMNT } from './coupon.js';
import { invalidateAuthMemCache } from './auth.js';

const MAX_SAME_ITEM_QTY = 2;
const pad = (n) => String(n).padStart(2, '0');
const num = (v) => Math.round(Number(v) || 0);

// Stable idempotency fingerprint for a submission (dedups double-clicks / retries without
// needing a client-supplied id): same buyer + same lines + same total within the window.
async function fingerprint(userId, order) {
  const basis = JSON.stringify({
    u: userId,
    items: (order.items || []).map((it) => [String(it.id || ''), Number(it.quantity) || 0, num(it.price)]),
    t: num(order.total),
  });
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(basis));
  return [...new Uint8Array(buf)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function createOrder(body, env, user) {
  const order = body?.order;
  if (!order || !Array.isArray(order.items) || order.items.length === 0) {
    return { status: 400, data: { error: 'Захиалга хоосон байна.' } };
  }

  const userId = user?.uid || `guest-${Date.now()}`;
  const customerEmail = user?.email || '';

  // --- idempotency: if the same submission was just accepted, return that order ---
  const fp = await fingerprint(userId, order).catch(() => null);
  const idemKey = fp ? `idem:${userId}:${fp}` : null;
  if (idemKey) {
    const prior = await env.CACHE.get(idemKey);
    if (prior) return { status: 200, data: { id: prior, userId, deduped: true } };
  }

  // --- price audit + hard validation (authoritative data from D1) ---
  // Batch-load all referenced products in chunks of 50 instead of N+1 sequential queries.
  const flags = [];
  let serverSubtotalKRW = 0;
  const itemIds = [...new Set(order.items.map((it) => (it?.id || '').toString()).filter(Boolean))];
  if (itemIds.length === 0) return { status: 400, data: { error: 'Барааны код дутуу байна.' } };

  const productMap = new Map();
  for (let i = 0; i < itemIds.length; i += 50) {
    const chunk = itemIds.slice(i, i + 50);
    const ph = chunk.map(() => '?').join(',');
    const { results } = await env.DB.prepare(
      `SELECT id, price, estimatedWarehousePrice, status FROM products WHERE id IN (${ph})`
    ).bind(...chunk).all();
    for (const row of results || []) productMap.set(String(row.id), row);
  }

  for (const it of order.items) {
    const pid = (it?.id || '').toString();
    const qty = Number(it?.quantity) || 0;
    const clientPrice = Number(it?.price) || 0;
    if (qty < 1 || qty > MAX_SAME_ITEM_QTY) {
      return { status: 400, data: { error: `Барааны тоо ширхэг буруу байна (1–${MAX_SAME_ITEM_QTY}).` } };
    }
    if (!pid) return { status: 400, data: { error: 'Барааны код дутуу байна.' } };
    const p = productMap.get(pid);
    if (!p) return { status: 400, data: { error: `Бараа олдсонгүй: ${pid}` } };
    if (p.status && p.status !== 'active') return { status: 409, data: { error: `Бараа боломжгүй байна: ${pid}` } };
    const sp = Number(p.price) || Number(p.estimatedWarehousePrice) || 0;
    serverSubtotalKRW += sp * qty;
    if (sp > 0 && clientPrice > 0 && clientPrice < sp * 0.85) flags.push(`low-price:${pid}`);
  }

  const clientTotal = num(order.total);
  const clientAmountPaid = num(order.amountPaid) || clientTotal;
  if (serverSubtotalKRW > 0 && clientTotal <= 0) {
    return { status: 400, data: { error: 'Захиалгын дүн буруу байна.' } };
  }

  // Load authoritative wonRate from D1 settings/currency (fallback 2.79)
  let wonRate = 2.79;
  try {
    const curRow = await env.DB.prepare("SELECT data FROM settings WHERE id = 'currency'").first();
    const parsedRate = Number(JSON.parse(curRow?.data || '{}').wonRate);
    if (parsedRate > 1.5 && parsedRate < 10) wonRate = parsedRate;
  } catch { /* fallback 2.79 */ }

  // Server-authoritative tier discount validation
  const userTier = user?.tier || 'Silver';
  const maxTierPct = userTier === 'Platinum' ? 0.10 : userTier === 'Gold' ? 0.05 : 0;
  const serverGoodsMNT = Math.round(serverSubtotalKRW * wonRate);
  const maxTierDiscountMNT = Math.round(serverGoodsMNT * maxTierPct);
  const validatedTierDiscount = maxTierPct > 0 ? Math.min(Math.max(0, num(order.tierDiscount)), maxTierDiscountMNT) : 0;

  // --- coupon: re-validate server-side; drop if ineligible; clamp the discount ---
  let couponCode = null, couponDiscount = 0;
  const rawCode = (order.couponCode || '').toString().trim().toUpperCase();
  if (rawCode) {
    const subtotalMNT = Math.max(serverGoodsMNT, clientTotal + num(order.couponDiscount) + num(order.pointsDiscount));
    const chk = await checkCoupon(env, rawCode, subtotalMNT);
    if (chk.ok) {
      couponCode = chk.coupon.code;
      // Never exceed the coupon's own ceiling, and never more than the goods value.
      const ceiling = couponDiscountMNT(chk.coupon, subtotalMNT);
      couponDiscount = Math.min(Math.max(0, num(order.couponDiscount)), ceiling, subtotalMNT);
    } // else: invalid/expired/over-cap → silently drop (couponCode stays null, discount 0)
  }

  // --- loyalty redemption (server-authoritative debit; staged, committed in the batch) ---
  let redeemKRW = Math.max(0, Math.round(Number(order.pointsRedeemedKRW) || 0));
  let loyaltyStmt = null;
  const redeemedLots = [];
  if (redeemKRW > 0) {
    if (!user?.uid) return { status: 403, data: { error: 'Оноо зарцуулахын тулд нэвтэрнэ үү.' } };
    const cap = Math.floor(serverSubtotalKRW * 0.5);
    const u = await env.DB.prepare('SELECT loyaltyLots, loyaltyPointsKRW FROM users WHERE uid = ?').bind(userId).first();
    let lots = []; try { lots = JSON.parse(u?.loyaltyLots || '[]'); } catch { lots = []; }
    const nowMs = Date.now();
    lots = lots.filter((l) => l && new Date(l.expiresAt).getTime() > nowMs)
      .sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime());
    const available = lots.reduce((s, l) => s + (Number(l.krw) || 0), 0);
    if (redeemKRW > available) return { status: 400, data: { error: 'Оноо хүрэлцэхгүй байна (эсвэл хугацаа дууссан).' } };
    if (redeemKRW > cap && !(order.shipmentGroup && Number(order.groupTotal) > 0)) {
      return { status: 400, data: { error: 'Захиалгын дүнгийн 50% хүртэл оноо зарцуулна.' } };
    }
    let rem = redeemKRW; const newLots = [];
    for (const l of lots) {
      const k = Number(l.krw) || 0;
      if (rem <= 0) { newLots.push(l); continue; }
      if (k <= rem) {
        redeemedLots.push({ ...l, krw: k });
        rem -= k;
        continue;
      }
      redeemedLots.push({ ...l, krw: rem });
      newLots.push({ ...l, krw: k - rem });
      rem = 0;
    }
    const newBal = newLots.reduce((s, l) => s + (Number(l.krw) || 0), 0);
    loyaltyStmt = env.DB.prepare('UPDATE users SET loyaltyLots = ?, loyaltyPointsKRW = ? WHERE uid = ?')
      .bind(JSON.stringify(newLots), newBal, userId);
  }

  const validatedPointsDiscount = redeemKRW > 0
    ? Math.min(Math.max(0, num(order.pointsDiscount)), Math.round(redeemKRW * wonRate * 1.05))
    : 0;

  // Enforce server-side minimum order total so a tampered request cannot pay less than real item cost
  const isSecondarySplitParcel = Boolean(order.shipmentGroup && Number(order.shipmentIndex) > 1);
  const minGoodsFloorMNT = Math.max(0, Math.round(serverGoodsMNT * 0.85) - couponDiscount - validatedPointsDiscount - validatedTierDiscount);
  if (!order.shipmentGroup && serverSubtotalKRW > 0 && clientTotal < minGoodsFloorMNT) {
    flags.push(`tampered-total:${clientTotal}<${minGoodsFloorMNT}`);
    return { status: 400, data: { error: 'Захиалгын дүн барааны үнэтэй таарахгүй байна. Сагсаа шинэчлээд дахин оролдоно уу.' } };
  }
  const authoritativeTotal = isSecondarySplitParcel ? clientTotal : Math.max(clientTotal, minGoodsFloorMNT);
  const authoritativeAmountPaid = isSecondarySplitParcel
    ? 0
    : Math.max(clientAmountPaid, authoritativeTotal + (order.paymentMethod === 'wire' ? Math.round(authoritativeTotal * 0.01) : 0));

  const priceAudit = {
    serverSubtotalKRW,
    wonRate,
    clientTotal,
    authoritativeTotal,
    redeemedLots: redeemedLots.length > 0 ? redeemedLots : undefined,
    flagged: flags.length > 0,
    flags,
    checkedAt: new Date().toISOString(),
  };

  // --- order id: DDHHMM + per-minute sequence starting at 1 ---
  const now = new Date();
  const dhm = `${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
  let orderId = null;
  for (let n = 1; n <= 9999; n++) {
    const cand = `${dhm}${n}`;
    const exists = await env.DB.prepare('SELECT 1 FROM orders WHERE id = ?').bind(cand).first();
    if (!exists) { orderId = cand; break; }
  }
  if (!orderId) orderId = `${dhm}${String(Date.now()).slice(-5)}`;

  const createdAt = now.toISOString();
  const trackingHistory = JSON.stringify([
    { stage: 'received', label: 'Захиалга хүлээн авсан', note: '', timestamp: createdAt },
  ]);

  // --- write everything ATOMICALLY (loyalty debit + order + items + coupon) ---
  const stmts = [];
  if (loyaltyStmt) stmts.push(loyaltyStmt);
  stmts.push(env.DB.prepare(
    `INSERT INTO orders
      (id,userId,customer,customerEmail,recipientName,recipientPhone,recipientPhone2,recipientRegister,
       recipientCustomsAddress,recipientAddress,deliveryMode,branch,deliveryFee,total,amountPaid,paymentFee,
       currency,paymentMethod,couponCode,couponDiscount,tierDiscount,pointsRedeemedKRW,pointsDiscount,
       launchSale,status,trackingStage,trackingHistory,priceAudit,shipmentGroup,deliveryLocation,
       brokerageConsent,createdAt,date)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    orderId, userId, order.customer || null, customerEmail, order.recipientName || null,
    order.recipientPhone || null, order.recipientPhone2 || null, order.recipientRegister || null,
    order.recipientCustomsAddress || null, order.recipientAddress || null, order.deliveryMode || null,
    order.branch || null, num(order.deliveryFee), authoritativeTotal, authoritativeAmountPaid, num(order.paymentFee),
    order.currency || 'MNT', order.paymentMethod || null, couponCode, couponDiscount,
    validatedTierDiscount, redeemKRW, validatedPointsDiscount, order.launchSale ? 1 : 0,
    order.status || 'Processing', 'received', trackingHistory, JSON.stringify(priceAudit),
    order.shipmentGroup || null, order.deliveryLocation ? JSON.stringify(order.deliveryLocation) : null,
    order.brokerageConsent ? 1 : 0, createdAt, order.date || createdAt
  ));
  for (const it of order.items) {
    stmts.push(env.DB.prepare(
      'INSERT INTO order_items (order_id,product_id,name,price,quantity,image,shippingMethod,selectedOptions) VALUES (?,?,?,?,?,?,?,?)'
    ).bind(orderId, (it.id || '').toString(), it.name || null, num(it.price), Number(it.quantity) || 1,
      it.image || null, it.shippingMethod || 'ground', it.selectedOptions ? JSON.stringify(it.selectedOptions) : null));
  }
  if (couponCode) stmts.push(env.DB.prepare('UPDATE coupons SET used = COALESCE(used,0) + 1 WHERE code = ?').bind(couponCode));

  await env.DB.batch(stmts);
  if (redeemKRW > 0) invalidateAuthMemCache(userId);

  // Remember this submission briefly so an immediate retry returns the same order.
  if (idemKey) { try { await env.CACHE.put(idemKey, orderId, { expirationTtl: 120 }); } catch { /* ignore */ } }

  return { status: 200, data: { id: orderId, userId, flagged: priceAudit.flagged } };
}

// ---- reads (getUserOrders / trackOrder / listAllOrders) ----
const parseJSON = (v, fb) => { try { return v ? JSON.parse(v) : fb; } catch { return fb; } };

export function shapeOrder(o, items) {
  return {
    id: o.id, userId: o.userId, customer: o.customer, customerEmail: o.customerEmail,
    recipientName: o.recipientName, recipientPhone: o.recipientPhone,
    recipientPhone2: o.recipientPhone2, recipientRegister: o.recipientRegister,
    recipientCustomsAddress: o.recipientCustomsAddress, recipientAddress: o.recipientAddress,
    deliveryMode: o.deliveryMode, branch: o.branch, deliveryFee: o.deliveryFee,
    total: o.total, amountPaid: o.amountPaid, paymentFee: o.paymentFee, currency: o.currency,
    paymentMethod: o.paymentMethod, couponCode: o.couponCode, couponDiscount: o.couponDiscount,
    tierDiscount: o.tierDiscount, pointsRedeemedKRW: o.pointsRedeemedKRW,
    pointsDiscount: o.pointsDiscount, launchSale: !!o.launchSale,
    pointsCredited: !!o.pointsCredited, pointsCreditedKRW: o.pointsCreditedKRW,
    status: o.status, trackingStage: o.trackingStage,
    trackingHistory: parseJSON(o.trackingHistory, []),
    priceAudit: parseJSON(o.priceAudit, null),
    shipmentGroup: o.shipmentGroup,
    deliveryLocation: parseJSON(o.deliveryLocation, null),
    brokerageConsent: !!o.brokerageConsent,
    returnRequest: parseJSON(o.returnRequest, null), qpay: parseJSON(o.qpay, null), wire: parseJSON(o.wire, null),
    trackingNumber: o.trackingNumber, estimatedDelivery: o.estimatedDelivery,
    additionalCharges: parseJSON(o.additionalCharges, []),
    deliveredReceiver: o.deliveredReceiver, deliveredPhoto: o.deliveredPhoto,
    createdAt: o.createdAt, date: o.date,
    items: (items || []).map((it) => ({
      id: it.product_id, name: it.name, price: it.price, quantity: it.quantity,
      image: it.image, shippingMethod: it.shippingMethod, selectedOptions: parseJSON(it.selectedOptions, null),
    })),
  };
}

/**
 * Attach order_items to a list of orders in batched IN (...) queries (chunks of 50)
 * instead of N+1 sequential queries.
 */
export async function withItems(env, rows) {
  const list = rows || [];
  if (list.length === 0) return [];
  const ids = list.map((o) => o.id).filter(Boolean);
  const itemsByOrder = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const ph = chunk.map(() => '?').join(',');
    const { results } = await env.DB.prepare(`SELECT * FROM order_items WHERE order_id IN (${ph})`).bind(...chunk).all();
    for (const it of results || []) {
      const arr = itemsByOrder.get(it.order_id) || [];
      arr.push(it);
      itemsByOrder.set(it.order_id, arr);
    }
  }
  return list.map((o) => shapeOrder(o, itemsByOrder.get(o.id) || []));
}

/** GET /api/orders — the authenticated user's orders (by uid OR recipient phone tail). */
export async function listUserOrders(env, user) {
  if (!user?.uid) return { status: 401, data: { error: 'unauthenticated' } };
  const tail = (user.phone || '').replace(/\D/g, '').slice(-8);
  const { results } = await env.DB.prepare(
    "SELECT * FROM orders WHERE userId = ? OR (recipientPhone IS NOT NULL AND substr(replace(replace(recipientPhone,'+',''),' ',''), -8) = ?) ORDER BY date DESC LIMIT 200"
  ).bind(user.uid, tail).all();
  return { status: 200, data: { orders: await withItems(env, results) } };
}

/** POST /api/order/return { orderId, reason } — customer requests a return (owner only). */
export async function requestReturn(body, env, user) {
  if (!user?.uid) return { status: 401, data: { error: 'unauthenticated' } };
  const id = (body?.orderId || '').toString();
  const reason = (body?.reason || '').toString().slice(0, 1000);
  const o = await env.DB.prepare('SELECT userId, recipientPhone FROM orders WHERE id = ?').bind(id).first();
  if (!o) return { status: 404, data: { error: 'not found' } };
  const tail = (user.phone || '').replace(/\D/g, '').slice(-8);
  const owns = o.userId === user.uid || (tail && (o.recipientPhone || '').replace(/\D/g, '').slice(-8) === tail) || user.isAdmin;
  if (!owns) return { status: 403, data: { error: 'forbidden' } };
  const rr = JSON.stringify({ status: 'pending', reason, requestedAt: new Date().toISOString() });
  await env.DB.prepare('UPDATE orders SET returnRequest = ? WHERE id = ?').bind(rr, id).run();
  return { status: 200, data: { ok: true } };
}

/**
 * Refund loyalty points and coupon usage when an UNPAID order is cancelled (by user back-out
 * or 24h auto-cancel). Idempotent: zeroes out pointsRedeemedKRW and couponCode on the order.
 */
export async function refundOrderBenefits(env, o) {
  if (!o) return;
  const stmts = [];
  const redeemedKRW = Math.max(0, Number(o.pointsRedeemedKRW) || 0);
  if (redeemedKRW > 0 && o.userId && !String(o.userId).startsWith('guest-')) {
    const u = await env.DB.prepare('SELECT loyaltyLots, loyaltyPointsKRW FROM users WHERE uid = ?').bind(o.userId).first();
    if (u) {
      let lots = []; try { lots = JSON.parse(u.loyaltyLots || '[]'); } catch { lots = []; }
      let audit = {}; try { audit = JSON.parse(o.priceAudit || '{}'); } catch { audit = {}; }
      const restoredLots = Array.isArray(audit.redeemedLots) && audit.redeemedLots.length > 0
        ? audit.redeemedLots
        : [{
            krw: redeemedKRW,
            creditedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            restoredFromOrderId: o.id,
          }];
      const mergedLots = [...lots, ...restoredLots].filter((l) => l && Number(l.krw) > 0);
      const newBal = mergedLots.reduce((s, l) => s + (Number(l.krw) || 0), 0);
      stmts.push(
        env.DB.prepare('UPDATE users SET loyaltyLots = ?, loyaltyPointsKRW = ? WHERE uid = ?')
          .bind(JSON.stringify(mergedLots), newBal, o.userId)
      );
      invalidateAuthMemCache(o.userId);
    }
  }
  if (o.couponCode) {
    stmts.push(
      env.DB.prepare('UPDATE coupons SET used = MAX(0, COALESCE(used, 1) - 1) WHERE code = ?')
        .bind(o.couponCode)
    );
  }
  if (redeemedKRW > 0 || o.couponCode) {
    stmts.push(
      env.DB.prepare('UPDATE orders SET pointsRedeemedKRW = 0, pointsDiscount = 0, couponCode = NULL, couponDiscount = 0 WHERE id = ?')
        .bind(o.id)
    );
  }
  if (stmts.length > 0) {
    await env.DB.batch(stmts);
  }
}

/**
 * POST /api/order/cancel { orderId } — cancel an UNPAID order immediately (e.g. the
 * shopper backed out of the QR screen without paying). Server-guarded: only the owner
 * can cancel, and only while the order is still `received` AND not paid. If the webhook
 * already confirmed payment, this is a safe no-op — a paid order is never cancelled.
 * Also cancels any sibling parcels in the same shipmentGroup and refunds redeemed points/coupons.
 */
export async function cancelUnpaidOrder(body, env, user) {
  const id = (body?.orderId || '').toString();
  const o = await env.DB.prepare(
    'SELECT id, userId, recipientPhone, trackingStage, wire, createdAt, date, trackingHistory, shipmentGroup, pointsRedeemedKRW, couponCode, priceAudit FROM orders WHERE id = ?'
  ).bind(id).first();
  if (!o) return { status: 404, data: { error: 'not found' } };
  const isRecentGuestOrder = String(o.userId || '').startsWith('guest-') &&
    o.createdAt && (Date.now() - new Date(o.createdAt).getTime() < 30 * 60 * 1000);
  const tail = (user?.phone || body?.phone || '').replace(/\D/g, '').slice(-8);
  const owns = (user?.uid && (o.userId === user.uid || user.isAdmin)) ||
    (tail && (o.recipientPhone || '').replace(/\D/g, '').slice(-8) === tail) ||
    isRecentGuestOrder;
  if (!owns) return { status: 403, data: { error: 'forbidden' } };
  let paid = false; try { paid = JSON.parse(o.wire || '{}')?.paid === true; } catch { paid = false; }
  // Only cancel an unpaid, still-received order. Otherwise leave it untouched.
  if ((o.trackingStage || 'received') !== 'received' || paid) {
    return { status: 200, data: { ok: false, cancelled: false, reason: 'paid_or_advanced' } };
  }

  let targets = [o];
  if (o.shipmentGroup) {
    const { results: groupRows } = await env.DB.prepare(
      "SELECT id, userId, trackingStage, wire, trackingHistory, shipmentGroup, pointsRedeemedKRW, couponCode, priceAudit FROM orders WHERE shipmentGroup = ? AND trackingStage = 'received'"
    ).bind(o.shipmentGroup).all();
    if (groupRows?.length) targets = groupRows;
  }

  const now = new Date().toISOString();
  for (const target of targets) {
    let targetPaid = false; try { targetPaid = JSON.parse(target.wire || '{}')?.paid === true; } catch { targetPaid = false; }
    if (targetPaid) continue;
    let prev = []; try { prev = JSON.parse(target.trackingHistory || '[]'); } catch { prev = []; }
    const history = [...prev.filter((e) => e.stage !== 'cancelled'),
      { stage: 'cancelled', label: 'Цуцлагдсан', note: 'Төлбөр төлөгдөөгүй (хэрэглэгч цуцалсан)', timestamp: now }];
    await env.DB.prepare("UPDATE orders SET trackingStage = 'cancelled', status = 'Cancelled', trackingHistory = ? WHERE id = ?")
      .bind(JSON.stringify(history), target.id).run();
    await refundOrderBenefits(env, target);
  }
  return { status: 200, data: { ok: true, cancelled: true, count: targets.length } };
}

/** GET /api/order/:id?phone=… — one order (owner via JWT/admin, or guest via phone tail / active checkout window). */
export async function getOrder(env, id, phone, user) {
  const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
  if (!o) return { status: 404, data: { error: 'not found' } };
  const phoneTail = (phone || '').replace(/\D/g, '').slice(-8);
  const isActiveGuestCheckout = String(o.userId || '').startsWith('guest-') &&
    o.createdAt && (Date.now() - new Date(o.createdAt).getTime() < 15 * 60 * 1000);
  const ownerOk =
    (user && (o.userId === user.uid || user.isAdmin)) ||
    (phoneTail && (o.recipientPhone || '').replace(/\D/g, '').slice(-8) === phoneTail) ||
    isActiveGuestCheckout;
  if (!ownerOk) return { status: 403, data: { error: 'forbidden' } };
  const { results } = await env.DB.prepare('SELECT * FROM order_items WHERE order_id = ?').bind(id).all();
  return { status: 200, data: { order: shapeOrder(o, results) } };
}
