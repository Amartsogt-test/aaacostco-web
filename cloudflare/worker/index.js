/**
 * costco.mn API Worker — Phase 1 (read path).
 *
 * Serves the catalog / search / categories straight from D1, with a short KV cache,
 * from Cloudflare's edge (Ulaanbaatar PoP) — replacing the US-Firestore round-trip for
 * browsing. Write/transaction endpoints (orders, auth, payments) come in later phases.
 *
 * Bindings (see wrangler.toml): DB (D1), CACHE (KV), IMAGES (R2).
 */

import { authenticate, requireAdmin } from './auth.js';
import { smsRequest, smsWebhook, smsVerify } from './sms-auth.js';
import { adminLogin } from './admin-auth.js';
import { createOrder, listUserOrders, getOrder, requestReturn, cancelUnpaidOrder } from './orders.js';
import { wireCallback, createWireInvoice } from './payments.js';
import { saveCart, getCart } from './cart.js';
import { getChat, sendMessage, listAdminChats, getAdminChat, adminSendMessage, pinMessage, likeMessage, broadcastMessage } from './chat.js';
import { aiSummary, aiScan } from './ai.js';
import { getUser, updateUser } from './user.js';
import { listAllOrders, setOrderStage, setSetting, upsertProduct, batchUpsertProducts, deleteProduct, patchOrder, getPublicSettings, getAdminSetting, listCoupons, upsertCoupon, deleteCoupon, listAdminProducts, getAIReviewItems, setCategoryBanner, getDailyReports, getAdminUser } from './admin.js';
import { validateCoupon } from './coupon.js';
import { runScheduled } from './cron.js';
import { uploadProductImage, uploadChatMedia, serveImage } from './images.js';
import { listManifests } from './manifest.js';
import { allowRequest } from './rate.js';
import { verifyMetaWebhook, handleMetaWebhook } from './social-webhook.js';
import { recordTelemetryError, getTelemetryErrors, autoHealEdgeSystem } from './telemetry.js';
import { sendDailyExecutiveReport } from './notify.js';

// CORS: reflect the request Origin only when it's allow-listed (costco.mn + the Pages
// preview + localhost dev by default; override with the ALLOWED_ORIGINS var, comma-sep).
// Falls back to the primary site origin for non-browser / unknown callers.
const DEFAULT_ORIGINS = [
  'https://costco.mn', 'https://www.costco.mn',
  'http://localhost:5173', 'http://localhost:3000',
];
function allowedOrigins(env) {
  const extra = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return new Set([...DEFAULT_ORIGINS, ...extra]);
}
function pickOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  const set = allowedOrigins(env);
  if (set.has(origin)) return origin;
  // Allow the project's *.pages.dev previews without listing each deployment hash.
  if (/^https:\/\/[a-z0-9-]+\.costco-fe\.pages\.dev$/.test(origin)) return origin;
  return DEFAULT_ORIGINS[0];
}
// Default: do NOT cache (responses may carry the caller's personal data — orders, profile,
// cart, chat). Public read routes opt INTO caching with PUBLIC_CACHE explicitly.
function corsHeaders(acao) {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': acao,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Filename, X-Admin-Sync-Secret',
    'Cache-Control': 'private, no-store',
  };
}
const PUBLIC_CACHE = { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=86400' };

// Columns needed for list/search cards (`shapeProduct(r, false)`). Avoiding `SELECT *` on
// list/search queries skips reading huge `specifications`, `description`, `description_mn`,
// and `images` columns from D1 SQLite pages (~90% less I/O per row).
const LIST_COLS =
  'id, code, name, name_mn, englishName, brand, image, price, originalPrice, ' +
  'estimatedWarehousePrice, estimatedMarkupKrw, hasDiscount, status, categoryCode, ' +
  'weight, ratingsAvg, reviewCount, additionalCategories, categoryPath, shortDescription';
const FTS_LIST_COLS = LIST_COLS.split(', ').map((c) => `p.${c}`).join(', ');

// Expand a D1 product row into the API shape (parse JSON columns).
// `full` adds the heavy fields needed on the product-detail page (descriptions etc.);
// list/search responses stay lean.
function shapeProduct(r, full = false) {
  if (!r) return null;
  const parse = (v, fb) => { try { return v ? JSON.parse(v) : fb; } catch { return fb; } };
  const p = {
    id: r.id,
    code: r.code || r.id,
    name: r.name,
    name_mn: r.name_mn,
    englishName: r.englishName,
    brand: r.brand,
    image: r.image,
    price: r.price,
    originalPrice: r.originalPrice,
    estimatedWarehousePrice: r.estimatedWarehousePrice,
    estimatedMarkupKrw: r.estimatedMarkupKrw,
    hasDiscount: !!r.hasDiscount,
    status: r.status,
    categoryCode: r.categoryCode,
    weight: r.weight,
    ratingsAvg: r.ratingsAvg,
    reviewCount: r.reviewCount,
    additionalCategories: parse(r.additionalCategories, []),
    categoryPath: parse(r.categoryPath, []),
    shortDescription: r.shortDescription,
  };
  if (full === true) {
    const specs = parse(r.specifications, []);
    p.images = parse(r.images, []);
    p.specifications = specs;
    p.specifications_mn = specs;
    p.description = r.description;
    p.description_mn = r.description_mn;
    p.barcode = r.barcode;
    p.stock = r.stock;
    p.targetCode = r.targetCode;
    p.restricted = !!r.restricted;
    p.restrictedNote = r.restrictedNote;
  }
  return p;
}

// Build a D1 WHERE clause for catalog queries (replaces the Firestore product queries
// in productService). Mirrors the same tag/category mapping the client used to do.
function productWhere({ category, subCategory, tag, statusMode = 'active' }) {
  const where = [];
  const args = [];
  const contains = (col, vals) => {
    where.push('(' + vals.map(() => `${col} LIKE ?`).join(' OR ') + ')');
    vals.forEach((v) => args.push(`%"${v}"%`));
  };
  // status visibility
  if (statusMode === 'catalog') where.push("status != 'deleted'");
  else if (statusMode === 'active') where.push("status = 'active'");
  else { where.push('status = ?'); args.push(statusMode); }
  // tag (highest priority), else category, plus optional subcategory
  if (tag) {
    if (tag === 'New') contains('additionalCategories', ['New', 'Шинэ', 'New Item']);
    else if (tag === 'Trend') contains('additionalCategories', ['Trend', 'Kirkland Signature', 'Kirkland']);
    else if (tag === 'Kirkland') contains('additionalCategories', ['Kirkland Signature', 'Kirkland']);
    else contains('additionalCategories', [tag]);
  } else if (category === 'Sale') {
    where.push('hasDiscount = 1');
  } else if (category === 'Featured') {
    where.push('targetCode = ?'); args.push('BuyersPick');
  } else if (category === 'ks_all' || category === 'Kirkland-Signature') {
    where.push('targetCode = ?'); args.push('ks_all');
  } else if (category && !subCategory) {
    where.push('(categoryCode = ? OR categoryPath LIKE ?)');
    args.push(category, `%"${category}"%`);
  }
  if (!tag && subCategory) contains('categoryPath', [subCategory]);
  return { clause: where.length ? 'WHERE ' + where.join(' AND ') : '', args };
}

// Isolate-memory cache for `cacheVer` (30s TTL) + hot response payloads (`memDataCache`, 30s TTL)
// so warm Worker isolates serve repeat public reads in <0.2ms with zero KV/D1 calls.
let memCacheVer = { v: null, exp: 0 };
const memDataCache = new Map();
const MAX_MEM_DATA_KEYS = 250;

function invalidateLocalCache() {
  memCacheVer.exp = 0;
  memDataCache.clear();
}

async function getCacheVersion(env) {
  const now = Date.now();
  if (memCacheVer.v && memCacheVer.exp > now) return memCacheVer.v;
  try {
    const v = (await env.CACHE.get('cacheVer')) || '1';
    if (memCacheVer.v && memCacheVer.v !== v) memDataCache.clear();
    memCacheVer = { v, exp: now + 30_000 };
    return v;
  } catch {
    return memCacheVer.v || '1';
  }
}

async function cached(env, json, key, ttl, producer) {
  const ver = await getCacheVersion(env);
  const vkey = `v${ver}:${key}`;
  const now = Date.now();
  const memHit = memDataCache.get(vkey);
  if (memHit && memHit.exp > now) {
    return json(memHit.data, 200, { 'X-Cache': 'MEM-HIT', ...PUBLIC_CACHE });
  }
  try {
    const hit = await env.CACHE.get(vkey);
    if (hit) {
      const parsed = JSON.parse(hit);
      if (memDataCache.size >= MAX_MEM_DATA_KEYS) {
        const oldest = memDataCache.keys().next().value;
        if (oldest) memDataCache.delete(oldest);
      }
      memDataCache.set(vkey, { data: parsed, exp: now + 30_000 });
      return json(parsed, 200, { 'X-Cache': 'HIT', ...PUBLIC_CACHE });
    }
  } catch { /* KV read error -> fall through to D1 */ }
  const data = await producer();
  if (data !== null && data !== undefined) {
    if (memDataCache.size >= MAX_MEM_DATA_KEYS) {
      const oldest = memDataCache.keys().next().value;
      if (oldest) memDataCache.delete(oldest);
    }
    memDataCache.set(vkey, { data, exp: now + 30_000 });
    try { await env.CACHE.put(vkey, JSON.stringify(data), { expirationTtl: ttl }); } catch { /* KV quota non-fatal */ }
  }
  return json(data, 200, { 'X-Cache': 'MISS', ...PUBLIC_CACHE });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname, searchParams } = url;

    // Per-request response builder with the correct (allow-listed) CORS origin.
    const acao = pickOrigin(request, env);
    const json = (data, status = 200, extra = {}) =>
      new Response(JSON.stringify(data), { status, headers: { ...corsHeaders(acao), ...extra } });

    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(acao) });

    try {
      // ---- POST routes (auth, orders, payment webhooks) ----
      if (request.method === 'POST') {
        // Uploads need the RAW binary body (before text()/JSON parse consumes it).
        if (pathname === '/api/admin/product/image') {
          const u = await authenticate(request, env);
          const r = await uploadProductImage(request, env, u);
          return json(r.data, r.status);
        }
        if (pathname === '/api/chat/upload') {
          const u = await authenticate(request, env);
          const r = await uploadChatMedia(request, env, u);
          return json(r.data, r.status);
        }
        const raw = await request.text();
        // Wire webhook needs the RAW body for HMAC verification (before JSON parse).
        if (pathname === '/api/payments/wire/callback') {
          const r = await wireCallback(request, env, raw);
          return new Response(typeof r.data === 'string' ? r.data : JSON.stringify(r.data), {
            status: r.status, headers: { 'Access-Control-Allow-Origin': '*' },
          });
        }
        const body = (() => { try { return raw ? JSON.parse(raw) : {}; } catch { return {}; } })();
        if (pathname === '/api/auth/sms/request') {
          if (!await allowRequest(env, request, 'sms', 5, 600)) return json({ error: 'Хэт олон оролдлого. Түр хүлээнэ үү.' }, 429);
          const r = await smsRequest(body, env); return json(r.data, r.status);
        }
        if (pathname === '/api/auth/sms/webhook') { const r = await smsWebhook(body, env); return json(r.data, r.status); }
        if (pathname === '/api/auth/sms/verify') {
          if (!await allowRequest(env, request, 'smsverify', 30, 300)) return json({ error: 'Хэт олон оролдлого. Түр хүлээнэ үү.' }, 429);
          const r = await smsVerify(body, env); return json(r.data, r.status);
        }
        if (pathname === '/api/auth/admin/login') {
          if (!await allowRequest(env, request, 'adminlogin', 10, 600)) return json({ error: 'Хэт олон оролдлого. Түр хүлээнэ үү.' }, 429);
          const r = await adminLogin(body, env); return json(r.data, r.status);
        }
        if (pathname === '/api/orders') {
          if (!await allowRequest(env, request, 'orders', 20, 600)) return json({ error: 'Хэт олон хүсэлт. Түр хүлээнэ үү.' }, 429);
          const u = await authenticate(request, env);          // null = guest checkout
          const r = await createOrder(body, env, u);
          return json(r.data, r.status);
        }
        if (pathname === '/api/payments/wire/create') {
          if (!await allowRequest(env, request, 'wirecreate', 15, 300)) return json({ error: 'Хэт олон хүсэлт. Түр хүлээнэ үү.' }, 429);
          const r = await createWireInvoice(body, env);
          return json(r.data, r.status);
        }
        if (pathname === '/api/cart') {
          const u = await authenticate(request, env);
          const r = await saveCart(body, env, u);
          return json(r.data, r.status);
        }
        if (pathname === '/api/chat/message') {
          const u = await authenticate(request, env);
          const r = await sendMessage(body, env, u);
          return json(r.data, r.status);
        }
        if (pathname === '/api/user') {
          const u = await authenticate(request, env);
          const r = await updateUser(body, env, u);
          return json(r.data, r.status);
        }
        if (pathname === '/api/order/return') {
          const u = await authenticate(request, env);
          const r = await requestReturn(body, env, u);
          return json(r.data, r.status);
        }
        if (pathname === '/api/order/cancel') {
          const u = await authenticate(request, env);
          const r = await cancelUnpaidOrder(body, env, u);
          return json(r.data, r.status);
        }
        if (pathname === '/api/admin/coupon') {
          const u = await authenticate(request, env);
          const r = await upsertCoupon(body, env, u);
          return json(r.data, r.status);
        }
        if (pathname === '/api/admin/coupon/delete') {
          const u = await authenticate(request, env);
          const r = await deleteCoupon(body, env, u);
          return json(r.data, r.status);
        }
        if (pathname === '/api/admin/order/stage') {
          const u = await authenticate(request, env);
          const r = await setOrderStage(body, env, u);
          return json(r.data, r.status);
        }
        if (pathname === '/api/admin/order/patch') {
          const u = await authenticate(request, env);
          const r = await patchOrder(body, env, u);
          return json(r.data, r.status);
        }
        if (pathname === '/api/admin/settings') {
          const u = await authenticate(request, env);
          const r = await setSetting(body, env, u);
          invalidateLocalCache();
          return json(r.data, r.status);
        }
        if (pathname === '/api/admin/product') {
          const u = await authenticate(request, env);
          const r = await upsertProduct(body, env, u);
          invalidateLocalCache();
          return json(r.data, r.status);
        }
        if (pathname === '/api/admin/products/batch') {
          const u = await authenticate(request, env);
          const r = await batchUpsertProducts(body, env, u);
          invalidateLocalCache();
          return json(r.data, r.status);
        }
        if (pathname === '/api/admin/product/delete') {
          const u = await authenticate(request, env);
          const r = await deleteProduct(body, env, u);
          invalidateLocalCache();
          return json(r.data, r.status);
        }
        if (pathname === '/api/admin/cron/run') {
          const u = await authenticate(request, env);
          requireAdmin(u);
          await runScheduled(env);
          return json({ ok: true });
        }
        if (pathname === '/api/coupon/validate') {
          const r = await validateCoupon(body, env);   // public
          return json(r.data, r.status);
        }
        if (pathname === '/api/admin/chat/message') {
          const u = await authenticate(request, env);
          const r = await adminSendMessage(body, env, u);
          return json(r.data, r.status);
        }
        if (pathname === '/api/admin/chat/pin') {
          const u = await authenticate(request, env);
          const r = await pinMessage(body, env, u);
          return json(r.data, r.status);
        }
        if (pathname === '/api/admin/chat/like') {
          const u = await authenticate(request, env);
          const r = await likeMessage(body, env, u);
          return json(r.data, r.status);
        }
        if (pathname === '/api/admin/chat/broadcast') {
          const u = await authenticate(request, env);
          const r = await broadcastMessage(body, env, u);
          return json(r.data, r.status);
        }
        if (pathname === '/api/admin/category/banner') {
          const u = await authenticate(request, env);
          const r = await setCategoryBanner(body, env, u);
          memCacheVer.exp = 0;
          return json(r.data, r.status);
        }
        if (pathname === '/api/ai/summary') {
          const u = await authenticate(request, env);
          const r = await aiSummary(body, env, u);
          return json(r.data, r.status);
        }
        if (pathname === '/api/ai/scan') {
          const u = await authenticate(request, env);
          const r = await aiScan(body, env, u);
          return json(r.data, r.status);
        }
        if (pathname === '/api/webhooks/meta') {
          const r = await handleMetaWebhook(body, env);
          return json(r.data, r.status);
        }
        if (pathname === '/api/telemetry/error') {
          if (!await allowRequest(env, request, 'telemetry', 30, 300)) return json({ ok: false }, 429);
          const r = await recordTelemetryError(body, env);
          return json(r.data, r.status);
        }
        if (pathname === '/api/admin/self-heal') {
          const u = await authenticate(request, env);
          requireAdmin(u);
          const report = await autoHealEdgeSystem(env);
          memCacheVer.exp = 0;
          return json({ ok: true, report });
        }
        if (pathname === '/api/admin/executive-report') {
          const u = await authenticate(request, env);
          requireAdmin(u);
          const report = await sendDailyExecutiveReport(env);
          return json({ ok: true, report });
        }
        return json({ error: 'not found' }, 404);
      }
      if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405);

      // GET /api/webhooks/meta — Meta verification challenge
      if (pathname === '/api/webhooks/meta') {
        return verifyMetaWebhook(url, env);
      }

      // GET /api/admin/telemetry — list captured errors (admin)
      if (pathname === '/api/admin/telemetry') {
        const u = await authenticate(request, env);
        const r = await getTelemetryErrors(env, u);
        return json(r.data, r.status);
      }

      // GET /api/health — liveness/readiness: ping D1 + KV in parallel (for uptime monitoring).
      if (pathname === '/api/health') {
        const [d1Ok, kvOk] = await Promise.all([
          env.DB.prepare('SELECT 1').first().then(() => true).catch(() => false),
          env.CACHE.get('cacheVer').then(() => true).catch(() => false),
        ]);
        const out = { ok: d1Ok && kvOk, time: new Date().toISOString(), d1: d1Ok, kv: kvOk };
        return json(out, out.ok ? 200 : 503);
      }

      // GET /sitemap.xml
      if (pathname === '/sitemap.xml') {
        const site = (env.SITE_URL || 'https://costco.mn').replace(/\/$/, '');
        const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const [prods, cats] = await Promise.all([
          env.DB.prepare("SELECT id, updatedAt FROM products WHERE status = 'active' ORDER BY updatedAt DESC LIMIT 45000").all(),
          env.DB.prepare('SELECT id FROM categories').all(),
        ]);
        const urls = [
          `<url><loc>${site}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
          ...(cats.results || []).map((c) => `<url><loc>${site}/category/${esc(c.id)}</loc><changefreq>daily</changefreq><priority>0.7</priority></url>`),
          ...(prods.results || []).map((p) => {
            const lm = p.updatedAt ? `<lastmod>${esc(String(p.updatedAt).slice(0, 10))}</lastmod>` : '';
            return `<url><loc>${site}/product/${esc(p.id)}</loc>${lm}<changefreq>weekly</changefreq><priority>0.6</priority></url>`;
          }),
        ];
        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;
        return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' } });
      }

      // GET /img/<key> — serve a product image/video stored in R2.
      const img = pathname.match(/^\/img\/(.+)$/);
      if (img) return serveImage(request, env, decodeURIComponent(img[1]));

      // GET /api/product/:id
      const m = pathname.match(/^\/api\/product\/([^/]+)$/);
      if (m) {
        const pid = decodeURIComponent(m[1]);
        const ver = await getCacheVersion(env);
        const vkey = `v${ver}:product:${pid}`;
        const now = Date.now();
        const memHit = memDataCache.get(vkey);
        if (memHit && memHit.exp > now) {
          return json(memHit.data, 200, { 'X-Cache': 'MEM-HIT', ...PUBLIC_CACHE });
        }
        try {
          const hit = await env.CACHE.get(vkey);
          if (hit) {
            const parsed = JSON.parse(hit);
            memDataCache.set(vkey, { data: parsed, exp: now + 30_000 });
            return json(parsed, 200, { 'X-Cache': 'HIT', ...PUBLIC_CACHE });
          }
        } catch { /* fall through */ }
        const row = await env.DB.prepare('SELECT * FROM products WHERE id = ? AND status = ?')
          .bind(pid, 'active').first();
        if (!row) return json({ error: 'not found' }, 404);
        const shaped = shapeProduct(row, true);
        memDataCache.set(vkey, { data: shaped, exp: now + 30_000 });
        try { await env.CACHE.put(vkey, JSON.stringify(shaped), { expirationTtl: 300 }); } catch { /* ignore */ }
        return json(shaped, 200, { 'X-Cache': 'MISS', ...PUBLIC_CACHE });
      }

      // GET /api/products?category=&subCategory=&tag=&status=catalog&limit=&offset=
      if (pathname === '/api/products') {
        const category = searchParams.get('category') || '';
        const subCategory = searchParams.get('subCategory') || '';
        const tag = searchParams.get('tag') || '';
        const statusMode = searchParams.get('status') === 'catalog' ? 'catalog' : 'active';
        const limit = Math.min(Number(searchParams.get('limit')) || 60, 200);
        const offset = Math.max(Number(searchParams.get('offset')) || 0, 0);
        const { clause, args } = productWhere({ category, subCategory, tag, statusMode });
        return cached(env, json, `products:${statusMode}:${category}:${subCategory}:${tag}:${limit}:${offset}`, 300, async () => {
          const { results } = await env.DB.prepare(`SELECT ${LIST_COLS} FROM products ${clause} ORDER BY id LIMIT ? OFFSET ?`)
            .bind(...args, limit, offset).all();
          return { products: (results || []).map((r) => shapeProduct(r, false)), limit, offset };
        });
      }

      // GET /api/products/count?category=&subCategory=&tag= — active-product count for a filter.
      if (pathname === '/api/products/count') {
        const category = searchParams.get('category') || '';
        const subCategory = searchParams.get('subCategory') || '';
        const tag = searchParams.get('tag') || '';
        const { clause, args } = productWhere({ category, subCategory, tag, statusMode: 'active' });
        return cached(env, json, `count:${category}:${subCategory}:${tag}`, 300, async () => {
          const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM products ${clause}`).bind(...args).first();
          return { count: Number(row?.n) || 0 };
        });
      }

      // GET /api/category-counts — active-product counts for every category + special tag (single scan).
      if (pathname === '/api/category-counts') {
        return cached(env, json, 'category-counts', 600, async () => {
          const [cats, prods] = await Promise.all([
            env.DB.prepare('SELECT id FROM categories').all(),
            env.DB.prepare("SELECT categoryCode, categoryPath, additionalCategories, hasDiscount, targetCode FROM products WHERE status = 'active'").all(),
          ]);
          const counts = { Sale: 0, New: 0, Kirkland: 0, Featured: 0 };
          for (const c of cats.results || []) counts[c.id] = 0;

          for (const p of prods.results || []) {
            const seenCats = new Set();
            if (p.categoryCode) seenCats.add(p.categoryCode);
            if (p.categoryPath) {
              try {
                const arr = JSON.parse(p.categoryPath);
                if (Array.isArray(arr)) arr.forEach((cid) => cid && seenCats.add(cid));
              } catch { /* ignore */ }
            }
            for (const cid of seenCats) {
              counts[cid] = (counts[cid] || 0) + 1;
            }
            const addStr = p.additionalCategories || '';
            if (p.hasDiscount || addStr.includes('"Sale"')) counts.Sale++;
            if (addStr.includes('"New"') || addStr.includes('"Шинэ"') || addStr.includes('"New Item"')) counts.New++;
            if (p.targetCode === 'ks_all' || addStr.includes('"Kirkland')) counts.Kirkland++;
            if (p.targetCode === 'BuyersPick' || addStr.includes('"Featured"')) counts.Featured++;
          }
          return { counts };
        });
      }

      // GET /api/admin/products?status=inactive — admin product lists (inactive | deleted).
      if (pathname === '/api/admin/products') {
        const u = await authenticate(request, env);
        const r = await listAdminProducts(env, u, searchParams.get('status') || 'inactive');
        return json(r.data, r.status);
      }

      // GET /api/admin/ai-review — products flagged for manual AI review.
      if (pathname === '/api/admin/ai-review') {
        const u = await authenticate(request, env);
        const r = await getAIReviewItems(env, u);
        return json(r.data, r.status);
      }

      // GET /api/search?q=
      if (pathname === '/api/search') {
        const q = (searchParams.get('q') || '').trim();
        if (q.length < 2) return json({ products: [] });
        return cached(env, json, `search:${q.toLowerCase()}`, 180, async () => {
          // Exact id/code first, then full-text (FTS5) with a LIKE fallback.
          const exact = await env.DB.prepare(`SELECT ${LIST_COLS} FROM products WHERE (id = ? OR code = ?) AND status = ? LIMIT 5`)
            .bind(q, q, 'active').all();
          if (exact.results?.length) return { products: exact.results.map((r) => shapeProduct(r, false)) };

          // FTS5: prefix-match each token ("tok"*), joined back to products for the row.
          const ftsQuery = q.split(/\s+/).filter(Boolean).slice(0, 6)
            .map((t) => `"${t.replace(/"/g, '""')}"*`).join(' ');
          if (ftsQuery) {
            try {
              const { results } = await env.DB.prepare(
                `SELECT ${FTS_LIST_COLS} FROM products_fts f JOIN products p ON p.id = f.id
                   WHERE products_fts MATCH ? AND p.status = 'active' LIMIT 40`
              ).bind(ftsQuery).all();
              return { products: (results || []).map((r) => shapeProduct(r, false)) };
            } catch { /* FTS table missing → LIKE fallback below */ }
          }
          const like = `%${q}%`;
          const { results } = await env.DB.prepare(
            `SELECT ${LIST_COLS} FROM products WHERE status = 'active'
               AND (name LIKE ? OR name_mn LIKE ? OR englishName LIKE ?) LIMIT 40`
          ).bind(like, like, like).all();
          return { products: (results || []).map((r) => shapeProduct(r, false)) };
        });
      }

      // GET /api/categories
      if (pathname === '/api/categories') {
        return cached(env, json, 'categories', 600, async () => {
          const { results } = await env.DB.prepare('SELECT * FROM categories').all();
          const parse = (v) => { try { return v ? JSON.parse(v) : []; } catch { return []; } };
          return {
            categories: (results || []).map((c) => ({
              id: c.id, label: c.label, url: c.url, imageUrl: c.imageUrl,
              banner: c.banner, subcategories: parse(c.subcategories),
            })),
          };
        });
      }

      // GET /api/settings?id=general — public read (replaces Firestore settings reads, cached 120s).
      if (pathname === '/api/settings') {
        const key = (searchParams.get('id') || 'general').toString();
        if (key === 'scraper') return json({ error: 'forbidden' }, 403);
        return cached(env, json, `settings:${key}`, 120, async () => {
          const r = await getPublicSettings(env, key);
          return r.data;
        });
      }

      // GET /api/admin/coupons — admin coupon list.
      if (pathname === '/api/admin/coupons') {
        const u = await authenticate(request, env);
        const r = await listCoupons(env, u);
        return json(r.data, r.status);
      }

      // GET /api/admin/settings?id=scraper — admin read of any settings doc.
      if (pathname === '/api/admin/settings') {
        const u = await authenticate(request, env);
        const r = await getAdminSetting(env, u, searchParams.get('id') || 'general');
        return json(r.data, r.status);
      }

      // GET /api/orders — the authenticated user's own orders.
      if (pathname === '/api/orders') {
        const u = await authenticate(request, env);
        const r = await listUserOrders(env, u);
        return json(r.data, r.status);
      }

      // GET /api/order/:id?phone=… — one order (owner via JWT, or guest via phone).
      const om = pathname.match(/^\/api\/order\/([^/]+)$/);
      if (om) {
        const u = await authenticate(request, env);
        const r = await getOrder(env, decodeURIComponent(om[1]), searchParams.get('phone'), u);
        return json(r.data, r.status);
      }

      // GET /api/admin/orders — all orders (admin only).
      if (pathname === '/api/admin/orders') {
        const u = await authenticate(request, env);
        const r = await listAllOrders(env, u);
        return json(r.data, r.status);
      }

      // GET /api/admin/manifests — recent daily customs manifests (admin).
      if (pathname === '/api/admin/manifests') {
        const u = await authenticate(request, env);
        requireAdmin(u);
        const r = await listManifests(env);
        return json(r.data, r.status);
      }

      // GET /api/admin/daily-reports — system daily reports (admin).
      if (pathname === '/api/admin/daily-reports') {
        const u = await authenticate(request, env);
        const r = await getDailyReports(env, u, searchParams.get('date'));
        return json(r.data, r.status);
      }

      // GET /api/admin/user/:id — get user profile (admin).
      const aum = pathname.match(/^\/api\/admin\/user\/([^/]+)$/);
      if (aum) {
        const u = await authenticate(request, env);
        const r = await getAdminUser(env, u, decodeURIComponent(aum[1]));
        return json(r.data, r.status);
      }

      // GET /api/admin/chats — all support conversations (admin).
      if (pathname === '/api/admin/chats') {
        const u = await authenticate(request, env);
        const r = await listAdminChats(env, u);
        return json(r.data, r.status);
      }
      // GET /api/admin/chat/:id — one conversation's messages (admin).
      const acm = pathname.match(/^\/api\/admin\/chat\/([^/]+)$/);
      if (acm) {
        const u = await authenticate(request, env);
        const r = await getAdminChat(env, decodeURIComponent(acm[1]), u);
        return json(r.data, r.status);
      }

      // GET /api/user — the caller's full profile (addresses, loyalty lots…).
      if (pathname === '/api/user') {
        const u = await authenticate(request, env);
        const r = await getUser(env, u);
        return json(r.data, r.status);
      }

      // GET /api/cart — the user's cart snapshot.
      if (pathname === '/api/cart') {
        const u = await authenticate(request, env);
        const r = await getCart(env, u);
        return json(r.data, r.status);
      }

      // GET /api/chat — the user's support conversation + messages (polled).
      if (pathname === '/api/chat') {
        const u = await authenticate(request, env);
        const markRead = searchParams.get('markRead') !== '0';
        const r = await getChat(env, u, markRead);
        return json(r.data, r.status);
      }

      // GET /api/auth/me — returns the caller's user (from Bearer JWT + KV session), or 401.
      if (pathname === '/api/auth/me') {
        const user = await authenticate(request, env);
        return user ? json({ user }) : json({ error: 'unauthenticated' }, 401);
      }

      return json({ error: 'not found' }, 404);
    } catch (e) {
      console.error('Worker error:', e);
      // requireAdmin / guards throw with an explicit .status (e.g. 403); honor it without leaking raw SQL errors.
      const status = e?.status || 500;
      if (status >= 500) {
        ctx?.waitUntil?.(
          recordTelemetryError({
            source: 'worker-500',
            message: String(e?.message || e),
            stack: String(e?.stack || ''),
            url: request.url,
          }, env)
        );
      }
      const msg = status < 500 ? String(e?.message || e) : 'Серверийн дотоод алдаа гарлаа.';
      return json({ error: msg }, status);
    }
  },

  // Cron Trigger (wrangler.toml [triggers] crons) — daily maintenance: expire loyalty
  // lots past their 1-month window, purge expired SMS codes.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduled(env));
  },
};
