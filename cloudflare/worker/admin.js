/**
 * admin.js — Phase-3 admin operations on the Worker (gated by requireAdmin).
 * Ports the order-stage pipeline from src/utils/orderTracking.js so admins advance
 * orders (the daily fulfilment work) against D1. Moving to 'confirmed' also runs the
 * loyalty/tier side effects (payments.onOrderConfirmed).
 *
 *   GET  /api/admin/orders                       (admin) — all orders
 *   POST /api/admin/order/stage  { id, stage, note }  (admin) — advance an order
 *   POST /api/admin/settings     { id, data }    (admin) — write a settings doc
 */
import { requireAdmin } from './auth.js';
import { onOrderConfirmed } from './payments.js';
import { withItems, refundOrderBenefits } from './orders.js';
import { sendPush, userTokens } from './fcm.js';

// Customer-facing push label per stage (ported from functions notifyOrderStage).
const STAGE_PUSH_LABEL = {
  confirmed: 'Захиалга баталгаажлаа', purchased: 'Солонгост худалдаж авлаа',
  warehouse: 'Солонгосын агуулахад хүлээн авлаа', shipped: 'Монгол руу ачигдлаа',
  customs: 'Гаалийн бүрдүүлэлтэд орлоо', arrived_ub: 'Улаанбаатарт ирлээ',
  out_for_delivery: 'Хүргэлтэнд гарлаа', delivered: 'Амжилттай хүргэгдлээ', cancelled: 'Захиалга цуцлагдлаа',
};

const ORDER_STAGES = [
  { key: 'confirmed', label: 'Захиалга баталгаажсан' },
  { key: 'purchased', label: 'Солонгост худалдаж авсан' },
  { key: 'warehouse', label: 'Агуулахад хүлээн авсан' },
  { key: 'shipped', label: 'Монгол руу ачигдсан' },
  { key: 'customs', label: 'Гаалийн бүрдүүлэлт' },
  { key: 'arrived_ub', label: 'Улаанбаатарт ирсэн' },
  { key: 'out_for_delivery', label: 'Хүргэлтэнд гарсан' },
  { key: 'delivered', label: 'Хүргэгдсэн' },
];
const STAGE_KEYS = ORDER_STAGES.map((s) => s.key);
const EXCEPTION = { cancelled: 'Цуцлагдсан', on_hold: 'Саатсан / Хүлээгдэж буй', failed: 'Хүргэлт амжилтгүй', returned: 'Буцаагдсан' };
const isException = (k) => k in EXCEPTION;

function stageToStatus(k) {
  if (k === 'delivered') return 'Хүргэгдсэн';
  if (k === 'cancelled' || k === 'returned') return 'Cancelled';
  if (k === 'received' || !k) return 'Processing';
  return 'Shipped';
}

/** Slider-style timeline patch: setting stage N marks 1..N done; keeps prior timestamps. */
function buildTrackingUpdate(order, stageKey, note = '') {
  const now = new Date().toISOString();
  let prev = []; try { prev = JSON.parse(order.trackingHistory || '[]'); } catch { prev = []; }
  const ts = {}, notes = {};
  prev.forEach((e) => { if (e.timestamp) ts[e.stage] = e.timestamp; if (e.note) notes[e.stage] = e.note; });
  const receivedTs = ts.received || order.createdAt || order.date || now;
  const cleanNote = (note || '').trim();

  if (isException(stageKey)) {
    const base = prev.filter((e) => !isException(e.stage));
    const history = [...base, { stage: stageKey, label: EXCEPTION[stageKey], note: cleanNote, timestamp: now }];
    return { trackingStage: stageKey, trackingHistory: history, status: stageToStatus(stageKey) };
  }
  const idx = STAGE_KEYS.indexOf(stageKey);
  if (idx < 0) return null;
  const history = [{ stage: 'received', label: 'Захиалга хүлээн авсан', note: notes.received || '', timestamp: receivedTs }];
  for (let i = 0; i <= idx; i++) {
    const def = ORDER_STAGES[i];
    const isTarget = i === idx;
    history.push({ stage: def.key, label: def.label, note: isTarget ? (cleanNote || notes[def.key] || '') : (notes[def.key] || ''), timestamp: isTarget ? now : (ts[def.key] || now) });
  }
  return { trackingStage: stageKey, trackingHistory: history, status: stageToStatus(stageKey) };
}

export async function listAllOrders(env, user) {
  requireAdmin(user);
  const { results } = await env.DB.prepare("SELECT * FROM orders WHERE status != 'deleted' ORDER BY date DESC LIMIT 500").all();
  const orders = await withItems(env, results || []);
  return { status: 200, data: { orders } };
}

export async function setOrderStage(body, env, user) {
  requireAdmin(user);
  const id = (body?.id || '').toString();
  const stage = (body?.stage || '').toString();
  const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
  if (!o) return { status: 404, data: { error: 'not found' } };
  const patch = buildTrackingUpdate(o, stage, body?.note);
  if (!patch) return { status: 400, data: { error: 'Буруу шат.' } };
  await env.DB.prepare('UPDATE orders SET trackingStage = ?, status = ?, trackingHistory = ? WHERE id = ?')
    .bind(patch.trackingStage, patch.status, JSON.stringify(patch.trackingHistory), id).run();
  // moving to confirmed triggers loyalty credit + tier recompute
  if (stage === 'confirmed') {
    const fresh = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
    await onOrderConfirmed(env, fresh);
  } else if (stage === 'cancelled' || stage === 'returned') {
    await refundOrderBenefits(env, o);
  }
  // Notify the owning account that the order advanced (skip guests / 'received').
  if (stage !== 'received' && o.userId && !String(o.userId).startsWith('guest-') && STAGE_PUSH_LABEL[stage]) {
    try {
      await sendPush(env, await userTokens(env, o.userId), {
        title: STAGE_PUSH_LABEL[stage], body: `Захиалга #${id}`, url: '/orders',
      });
    } catch (e) { console.error('stage push failed:', e); }
  }
  return { status: 200, data: { ok: true, trackingStage: patch.trackingStage, status: patch.status } };
}

// Admin-patchable order fields (allowlist) — courier tracking, ETA, extra customs
// charges, proof-of-delivery, status, and trackingStage. JSON columns are stringified.
const PATCHABLE = new Set([
  'trackingNumber', 'estimatedDelivery', 'additionalCharges',
  'deliveredReceiver', 'deliveredPhoto', 'status', 'trackingStage',
]);
const PATCH_JSON = new Set(['additionalCharges']);

/** POST /api/admin/order/patch { id, patch } — set safe order fields (admin). */
export async function patchOrder(body, env, user) {
  requireAdmin(user);
  const id = (body?.id || '').toString();
  const patch = body?.patch || {};
  if (!id) return { status: 400, data: { error: 'id шаардлагатай.' } };
  const cols = [], vals = [];
  for (const [k, v] of Object.entries(patch)) {
    if (!PATCHABLE.has(k)) continue;
    cols.push(`${k} = ?`);
    vals.push(PATCH_JSON.has(k) ? (v == null ? null : JSON.stringify(v)) : v);
  }
  if (!cols.length) return { status: 400, data: { error: 'Зөвшөөрөгдсөн талбар алга.' } };
  await env.DB.prepare(`UPDATE orders SET ${cols.join(', ')} WHERE id = ?`).bind(...vals, id).run();
  return { status: 200, data: { ok: true } };
}

export async function setSetting(body, env, user) {
  requireAdmin(user);
  const id = (body?.id || '').toString();
  if (!id) return { status: 400, data: { error: 'id шаардлагатай.' } };
  // Shallow-merge into the existing doc (mirrors Firestore setDoc({merge:true})), so a
  // partial admin update never wipes other settings keys.
  const existing = await env.DB.prepare('SELECT data FROM settings WHERE id = ?').bind(id).first();
  let merged = {}; try { merged = JSON.parse(existing?.data || '{}'); } catch { merged = {}; }
  merged = { ...merged, ...(body?.data || {}) };
  await env.DB.prepare('INSERT OR REPLACE INTO settings (id, data, updatedAt) VALUES (?,?,?)')
    .bind(id, JSON.stringify(merged), new Date().toISOString()).run();
  await bumpCacheVersion(env);
  return { status: 200, data: { ok: true } };
}

// ---- product CRUD (admin) ----
const PRODUCT_COLS = ['name', 'name_mn', 'englishName', 'brand', 'code', 'image', 'price', 'originalPrice',
  'estimatedWarehousePrice', 'estimatedMarkupKrw', 'hasDiscount', 'hidePriceValue', 'priceFromWarehouse',
  'status', 'categoryCode', 'targetCode', 'weight', 'barcode', 'stock', 'shortDescription', 'description',
  'description_mn', 'ratingsAvg', 'reviewCount', 'restricted', 'restrictedNote', 'specifications',
  'additionalCategories', 'categoryPath', 'images', 'lastScraped', 'updatedAt'];
const JSON_COLS = new Set(['specifications', 'additionalCategories', 'categoryPath', 'images']);
const BOOL_COLS = new Set(['hasDiscount', 'hidePriceValue', 'priceFromWarehouse', 'restricted']);

// Normalize legacy / scanner / Python scraper field aliases into D1 product columns.
function normalizeProductPayload(raw) {
  const p = { ...(raw || {}) };
  if (p.price === undefined && p.priceKRW !== undefined) {
    p.price = typeof p.priceKRW === 'object' ? Number(p.priceKRW?.value) || 0 : Number(p.priceKRW) || 0;
  } else if (typeof p.price === 'object' && p.price !== null) {
    p.price = Number(p.price?.value) || 0;
  }
  if (p.originalPrice === undefined && p.originalPriceKRW !== undefined) {
    p.originalPrice = typeof p.originalPriceKRW === 'object' ? Number(p.originalPriceKRW?.value) || 0 : Number(p.originalPriceKRW) || 0;
  } else if (typeof p.originalPrice === 'object' && p.originalPrice !== null) {
    p.originalPrice = Number(p.originalPrice?.value) || 0;
  }
  if (p.weight === undefined && p.weightKg !== undefined) {
    p.weight = Number(p.weightKg) || 0;
  } else if (p.weight === undefined && p.aiWeight !== undefined) {
    p.weight = Number(p.aiWeight) || 0;
  }
  if (p.categoryCode === undefined && p.mainCategory !== undefined) {
    p.categoryCode = p.mainCategory;
  }
  if (p.categoryPath === undefined && Array.isArray(p.categories)) {
    p.categoryPath = p.categories;
  }
  return p;
}

// Bump the global cache version so the KV-cached product/category list snapshots are
// instantly orphaned after an admin write (see index.js cached()).
async function bumpCacheVersion(env) {
  try { const v = Number(await env.CACHE.get('cacheVer')) || 1; await env.CACHE.put('cacheVer', String(v + 1)); }
  catch { /* non-fatal */ }
}

/** POST /api/admin/product { product } — create or PARTIAL-update (never wipes unset cols). */
export async function upsertProduct(body, env, user) {
  requireAdmin(user);
  const p = normalizeProductPayload(body?.product);
  const id = (p.id || p.code || '').toString();
  if (!id) return { status: 400, data: { error: 'id шаардлагатай.' } };
  p.updatedAt = new Date().toISOString();
  const cols = [], vals = [];
  for (const c of PRODUCT_COLS) {
    if (p[c] === undefined) continue;
    cols.push(c);
    let v = p[c];
    if (JSON_COLS.has(c)) v = v == null ? null : (typeof v === 'string' ? v : JSON.stringify(v));
    else if (BOOL_COLS.has(c)) v = v ? 1 : 0;
    vals.push(v);
  }
  const exists = await env.DB.prepare('SELECT 1 FROM products WHERE id = ?').bind(id).first();
  if (exists) {
    if (!cols.length) return { status: 200, data: { ok: true, id } };
    await env.DB.prepare(`UPDATE products SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).bind(...vals, id).run();
  } else {
    if (p.createdAt === undefined) { cols.push('createdAt'); vals.push(p.updatedAt); }
    await env.DB.prepare(`INSERT INTO products (id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})`).bind(id, ...vals).run();
  }
  await bumpCacheVersion(env);
  return { status: 200, data: { ok: true, id } };
}

/**
 * POST /api/admin/products/batch { products: [...] } — bulk partial-upsert for scraper/AI sync.
 * Processes up to 100 products per call using D1 batching.
 */
export async function batchUpsertProducts(body, env, user) {
  requireAdmin(user);
  const items = Array.isArray(body?.products) ? body.products : [];
  if (items.length === 0) return { status: 200, data: { ok: true, count: 0 } };

  const ids = items.map((it) => String(it?.id || it?.code || '')).filter(Boolean);
  const existingIds = new Set();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const ph = chunk.map(() => '?').join(',');
    const { results } = await env.DB.prepare(`SELECT id FROM products WHERE id IN (${ph})`).bind(...chunk).all();
    for (const r of results || []) existingIds.add(String(r.id));
  }

  const now = new Date().toISOString();
  const stmts = [];
  for (const raw of items) {
    const p = normalizeProductPayload(raw);
    const id = String(p.id || p.code || '');
    if (!id) continue;
    p.updatedAt = p.updatedAt || now;
    const cols = [], vals = [];
    for (const c of PRODUCT_COLS) {
      if (p[c] === undefined) continue;
      cols.push(c);
      let v = p[c];
      if (JSON_COLS.has(c)) v = v == null ? null : (typeof v === 'string' ? v : JSON.stringify(v));
      else if (BOOL_COLS.has(c)) v = v ? 1 : 0;
      vals.push(v);
    }
    if (!cols.length) continue;
    if (existingIds.has(id)) {
      stmts.push(env.DB.prepare(`UPDATE products SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).bind(...vals, id));
    } else {
      if (p.createdAt === undefined) { cols.push('createdAt'); vals.push(p.updatedAt); }
      stmts.push(env.DB.prepare(`INSERT INTO products (id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})`).bind(id, ...vals));
    }
  }

  for (let i = 0; i < stmts.length; i += 50) {
    await env.DB.batch(stmts.slice(i, i + 50));
  }
  await bumpCacheVersion(env);
  return { status: 200, data: { ok: true, count: stmts.length } };
}

/** POST /api/admin/product/delete { id } — soft delete (status='deleted'; never hard-deleted). */
export async function deleteProduct(body, env, user) {
  requireAdmin(user);
  const id = (body?.id || '').toString();
  if (!id) return { status: 400, data: { error: 'id шаардлагатай.' } };
  await env.DB.prepare("UPDATE products SET status = 'deleted', updatedAt = ? WHERE id = ?").bind(new Date().toISOString(), id).run();
  await bumpCacheVersion(env);
  return { status: 200, data: { ok: true } };
}

// Lean product shape for admin lists (full row not needed for the list UI).
function leanProduct(r) {
  return {
    id: r.id, name: r.name, name_mn: r.name_mn, englishName: r.englishName, brand: r.brand,
    image: r.image, price: r.price, originalPrice: r.originalPrice, code: r.code,
    status: r.status, stock: r.stock, weight: r.weight, updatedAt: r.updatedAt,
    aiWeightStatus: r.aiWeightStatus, translationStatus: r.translationStatus, aiDescriptionStatus: r.aiDescriptionStatus,
  };
}

/** GET /api/admin/products?status=inactive — admin product list by status (inactive|deleted|active). */
export async function listAdminProducts(env, user, status) {
  requireAdmin(user);
  const s = ['inactive', 'deleted', 'active'].includes(status) ? status : 'inactive';
  const { results } = await env.DB.prepare('SELECT * FROM products WHERE status = ? ORDER BY updatedAt DESC LIMIT 2000').bind(s).all();
  return { status: 200, data: { products: (results || []).map(leanProduct) } };
}

/** GET /api/admin/ai-review — products needing weight, translation, or description review. */
export async function getAIReviewItems(env, user) {
  requireAdmin(user);
  const safeQuery = async (sql, ...args) => {
    try {
      const { results } = await env.DB.prepare(sql).bind(...args).all();
      return (results || []).map(leanProduct);
    } catch { return []; }
  };
  const [weights, translations, descriptions] = await Promise.all([
    safeQuery("SELECT * FROM products WHERE status = 'active' AND (weight IS NULL OR weight <= 0) LIMIT 200"),
    safeQuery("SELECT * FROM products WHERE status = 'active' AND (name_mn IS NULL OR trim(name_mn) = '') LIMIT 200"),
    safeQuery("SELECT * FROM products WHERE status = 'active' AND (description_mn IS NULL OR trim(description_mn) = '') LIMIT 200"),
  ]);
  return { status: 200, data: { weights, translations, descriptions } };
}

/** POST /api/admin/category/banner { id, banner } — set/clear a category's banner image URL. */
export async function setCategoryBanner(body, env, user) {
  requireAdmin(user);
  const id = (body?.id || '').toString();
  if (!id) return { status: 400, data: { error: 'id шаардлагатай.' } };
  const banner = body?.banner || null;
  await env.DB.prepare('UPDATE categories SET banner = ? WHERE id = ?').bind(banner, id).run();
  await bumpCacheVersion(env);
  return { status: 200, data: { ok: true } };
}

// ---- settings (PUBLIC read) ----
/**
 * GET /api/settings?id=general — public read of a settings doc (general, currency, …).
 * Replaces the Firestore settingsService.getSettings/subscribeToCurrency reads. Only the
 * non-sensitive docs are exposed; 'scraper' (admin-only ops config) is blocked here.
 */
export async function getPublicSettings(env, id) {
  const key = (id || 'general').toString();
  if (key === 'scraper') return { status: 403, data: { error: 'forbidden' } };
  const row = await env.DB.prepare('SELECT data FROM settings WHERE id = ?').bind(key).first();
  let data = {}; try { data = JSON.parse(row?.data || '{}'); } catch { data = {}; }
  return { status: 200, data };
}

/** GET /api/admin/settings?id=scraper — admin read of ANY settings doc (incl. scraper). */
export async function getAdminSetting(env, user, id) {
  requireAdmin(user);
  const key = (id || 'general').toString();
  const row = await env.DB.prepare('SELECT data FROM settings WHERE id = ?').bind(key).first();
  let data = {}; try { data = JSON.parse(row?.data || '{}'); } catch { data = {}; }
  return { status: 200, data };
}

// ---- coupon CRUD (admin) ----
/** GET /api/admin/coupons — list every coupon for the admin coupons screen. */
export async function listCoupons(env, user) {
  requireAdmin(user);
  const { results } = await env.DB.prepare('SELECT * FROM coupons ORDER BY code').all();
  return { status: 200, data: { coupons: results || [] } };
}

/** POST /api/admin/coupon { coupon } — create or update a coupon (keyed by code). */
export async function upsertCoupon(body, env, user) {
  requireAdmin(user);
  const c = body?.coupon || {};
  const code = (c.code || '').toString().trim().toUpperCase();
  if (!code) return { status: 400, data: { error: 'Купоны код шаардлагатай.' } };
  const type = c.type === 'fixed' ? 'fixed' : 'percent';
  const value = Math.max(0, Number(c.value) || 0);
  const active = c.active === false || c.active === 0 ? 0 : 1;
  const minOrderMNT = c.minOrderMNT != null ? Math.max(0, Math.round(Number(c.minOrderMNT) || 0)) : null;
  const rawCap = c.cap !== undefined ? c.cap : c.usageLimit;
  const cap = rawCap != null && rawCap !== '' ? Math.max(0, Math.round(Number(rawCap) || 0)) : null;
  const expiresAt = c.expiresAt ? new Date(c.expiresAt).toISOString() : null;
  const existing = await env.DB.prepare('SELECT used FROM coupons WHERE code = ?').bind(code).first();
  const used = existing ? Number(existing.used) || 0 : 0;
  await env.DB.prepare(
    `INSERT OR REPLACE INTO coupons (code, type, value, active, minOrderMNT, cap, used, expiresAt)
       VALUES (?,?,?,?,?,?,?,?)`
  ).bind(code, type, value, active, minOrderMNT, cap, used, expiresAt).run();
  return { status: 200, data: { ok: true, code } };
}

/** POST /api/admin/coupon/delete { code } — remove a coupon. */
export async function deleteCoupon(body, env, user) {
  requireAdmin(user);
  const code = (body?.code || '').toString().trim().toUpperCase();
  if (!code) return { status: 400, data: { error: 'code шаардлагатай.' } };
  await env.DB.prepare('DELETE FROM coupons WHERE code = ?').bind(code).run();
  return { status: 200, data: { ok: true } };
}

/** GET /api/admin/daily-reports?date=YYYY-MM-DD — get dates or specific report. */
export async function getDailyReports(env, user, date) {
  requireAdmin(user);
  if (date) {
    const row = await env.DB.prepare('SELECT data FROM daily_reports WHERE id = ?').bind(date).first();
    let data = null; try { data = row ? JSON.parse(row.data) : null; } catch { data = null; }
    return { status: 200, data: { report: data } };
  } else {
    const { results } = await env.DB.prepare('SELECT id FROM daily_reports ORDER BY id DESC LIMIT 30').all();
    return { status: 200, data: { dates: (results || []).map((r) => r.id) } };
  }
}

/** GET /api/admin/user/:id — get user profile (admin). */
export async function getAdminUser(env, adminUser, uid) {
  requireAdmin(adminUser);
  const row = await env.DB.prepare('SELECT * FROM users WHERE uid = ?').bind(uid).first();
  if (!row) return { status: 404, data: { error: 'not found' } };
  const parse = (v, fb) => { try { return v ? JSON.parse(v) : fb; } catch { return fb; } };
  return { status: 200, data: { user: { ...row, followStatus: parse(row.followStatus, { facebook: null, instagram: null }), addresses: parse(row.addresses, []) } } };
}
