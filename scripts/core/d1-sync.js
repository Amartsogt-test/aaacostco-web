/**
 * scripts/core/d1-sync.js
 *
 * Bridges the local/CI scraper & AI pipeline (Firestore) with the production
 * Cloudflare Worker D1 edge database.
 *
 * Supports two sync transports:
 *   1. Fast HTTP batch API (`POST /api/admin/products/batch`, `POST /api/admin/settings`)
 *      when `ADMIN_SYNC_SECRET` or `CF_ADMIN_TOKEN` is set in env.
 *   2. Wrangler CLI (`npx wrangler d1 execute costco --file=... --remote`) when run on
 *      an authenticated operator machine (like the Korea office PC).
 *
 * SAFETY: Never touches live transactional tables (`orders`, `order_items`, `users`,
 * `chats`, `messages`, `carts`). Only syncs catalog & settings (`products`, `categories`,
 * `settings`, `daily_reports`).
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../..');

dotenv.config({ path: path.join(ROOT_DIR, '.env') });
dotenv.config({ path: path.join(ROOT_DIR, '.env.local') });

const API_BASE = (process.env.VITE_API_BASE || 'https://costco-api.costcomn.workers.dev').replace(/\/$/, '');
const SYNC_SECRET = process.env.ADMIN_SYNC_SECRET || '';
const ADMIN_TOKEN = process.env.CF_ADMIN_TOKEN || '';

function authHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (SYNC_SECRET) headers['X-Admin-Sync-Secret'] = SYNC_SECRET;
    if (ADMIN_TOKEN) headers['Authorization'] = `Bearer ${ADMIN_TOKEN}`;
    return headers;
}

export function normalizeProductForD1(id, p) {
    const rawPrice = (p.price && typeof p.price === 'object') ? p.price.value : (p.price ?? p.priceKRW ?? 0);
    const rawOrig = (p.originalPrice && typeof p.originalPrice === 'object') ? p.originalPrice.value : (p.originalPrice ?? p.originalPriceKRW ?? 0);
    const rawWeight = p.weight ?? p.weightKg ?? p.aiWeight ?? null;
        const catCode = p.categoryCode || p.category || p.mainCategory || p.cat || null;
        const catPath = Array.isArray(p.categoryPath) && p.categoryPath.length > 0
            ? p.categoryPath
            : Array.isArray(p.categories) && p.categories.length > 0
            ? p.categories
            : catCode
            ? [catCode, p.subCategory].filter(Boolean)
            : [];
        return {
            id: String(id || p.id || p.code),
            name: p.name || p.n || '',
            name_mn: p.name_mn || p.m || null,
            englishName: p.englishName || p.e || null,
            brand: p.brand || p.b || null,
            code: p.code || p.c || String(id || p.id || ''),
            image: p.image || p.i || (Array.isArray(p.images) && p.images[0]) || null,
            price: Number(rawPrice || p.p) || 0,
            originalPrice: Number(rawOrig || p.o) || 0,
            estimatedWarehousePrice: Number(p.estimatedWarehousePrice ?? p.w) || 0,
            estimatedMarkupKrw: Number(p.estimatedMarkupKrw ?? p.mk) || 0,
            hasDiscount: !!(p.hasDiscount ?? p.d),
            hidePriceValue: !!p.hidePriceValue,
            priceFromWarehouse: !!p.priceFromWarehouse,
            status: p.status || p.s || 'active',
            categoryCode: catCode,
            targetCode: p.targetCode || null,
            weight: rawWeight !== null && rawWeight !== '' && Number.isFinite(Number(rawWeight)) ? Number(rawWeight) : null,
            barcode: p.barcode || null,
            stock: p.stock || p.stockStatus || null,
            shortDescription: p.shortDescription || p.summary || null,
            description: p.description || null,
            description_mn: p.description_mn || p.sm || null,
            ratingsAvg: Number(p.ratingsAvg ?? p.rating ?? p.r) || 0,
            reviewCount: Number(p.reviewCount ?? p.rc) || 0,
            restricted: !!p.restricted,
            restrictedNote: p.restrictedNote || null,
            specifications: p.specifications || null,
            additionalCategories: p.additionalCategories || p.ac || [],
            categoryPath: catPath,
            images: p.images || (p.image || p.i ? [p.image || p.i] : []),
            lastScraped: typeof p.lastScraped === 'string' ? p.lastScraped : new Date().toISOString(),
            createdAt: typeof p.createdAt === 'string' ? p.createdAt : new Date().toISOString(),
            updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : new Date().toISOString(),
        };
}

/**
 * Push a single setting document (e.g. 'currency') to Cloudflare D1.
 */
export async function syncSettingToD1(settingId, data) {
    if (SYNC_SECRET || ADMIN_TOKEN) {
        try {
            const res = await fetch(`${API_BASE}/api/admin/settings`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ id: settingId, data }),
            });
            if (res.ok) {
                console.log(`☁️  Synced settings/${settingId} to Cloudflare Worker via API.`);
                return true;
            }
        } catch (err) {
            console.warn(`⚠️ Worker API settings sync warning: ${err.message}`);
        }
    }

    // Fallback to wrangler CLI if available
    try {
        const seedDir = path.join(ROOT_DIR, 'cloudflare', 'seed');
        fs.mkdirSync(seedDir, { recursive: true });
        const sqlFile = path.join(seedDir, `sync-setting-${settingId}.sql`);
        const jsonStr = JSON.stringify(data).replace(/'/g, "''");
        const now = new Date().toISOString();
        const sql = `INSERT OR REPLACE INTO settings (id, data, updatedAt) VALUES ('${settingId.replace(/'/g, "''")}', '${jsonStr}', '${now}');\n`;
        fs.writeFileSync(sqlFile, sql, 'utf8');
        const wranglerConfig = path.join(ROOT_DIR, 'cloudflare', 'wrangler.toml');
        execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', [
            'wrangler', 'd1', 'execute', 'costco', '-c', wranglerConfig, `--file=${sqlFile}`, '--remote'
        ], { cwd: ROOT_DIR, stdio: 'pipe' });
        console.log(`☁️  Synced settings/${settingId} to Cloudflare D1 via Wrangler.`);
        return true;
    } catch {
        return false;
    }
}

/**
 * Push an array of products to Cloudflare D1 via Worker HTTP batch API or Wrangler SQL.
 */
export async function syncProductsToD1(products) {
    if (!Array.isArray(products) || products.length === 0) return { synced: 0 };
    const normalized = products.map((p) => normalizeProductForD1(p.id, p));

    if (SYNC_SECRET || ADMIN_TOKEN) {
        try {
            let synced = 0;
            const CHUNK = 200;
            for (let i = 0; i < normalized.length; i += CHUNK) {
                const slice = normalized.slice(i, i + CHUNK);
                const res = await fetch(`${API_BASE}/api/admin/products/batch`, {
                    method: 'POST',
                    headers: authHeaders(),
                    body: JSON.stringify({ products: slice }),
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                synced += slice.length;
            }
            console.log(`☁️  Synced ${synced} products to Cloudflare Worker D1 via HTTP batch.`);
            return { synced };
        } catch (err) {
            console.warn(`⚠️ Worker HTTP batch failed (${err.message}), falling back to Wrangler SQL...`);
        }
    }

    // Fallback: write SQL file and execute via wrangler d1 execute
    const q = (v) => {
        if (v === undefined || v === null) return 'NULL';
        if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
        if (typeof v === 'boolean') return v ? '1' : '0';
        return `'${String(v).replace(/'/g, "''")}'`;
    };
    const j = (v) => (v === undefined || v === null ? 'NULL' : `'${JSON.stringify(v).replace(/'/g, "''")}'`);
    const b = (v) => (v ? '1' : '0');

    const cols = [
        'id','name','name_mn','englishName','brand','code','image','price','originalPrice',
        'estimatedWarehousePrice','estimatedMarkupKrw','hasDiscount','hidePriceValue','priceFromWarehouse',
        'status','categoryCode','targetCode','weight','barcode','stock','shortDescription','description',
        'description_mn','ratingsAvg','reviewCount','restricted','restrictedNote','specifications',
        'additionalCategories','categoryPath','images','lastScraped','createdAt','updatedAt'
    ];
    const prefix = `INSERT OR REPLACE INTO products (${cols.join(', ')}) VALUES\n`;
    let out = `PRAGMA foreign_keys=OFF;\n`;
    const MAX = 45000;
    let buf = [], bufLen = 0;
    const flush = () => { if (buf.length) { out += prefix + buf.join(',\n') + ';\n'; buf = []; bufLen = 0; } };

    for (const p of normalized) {
        const row = [
            q(p.id), q(p.name), q(p.name_mn), q(p.englishName), q(p.brand), q(p.code), q(p.image),
            q(p.price), q(p.originalPrice), q(p.estimatedWarehousePrice), q(p.estimatedMarkupKrw),
            b(p.hasDiscount), b(p.hidePriceValue), b(p.priceFromWarehouse), q(p.status),
            q(p.categoryCode), q(p.targetCode), q(p.weight), q(p.barcode), q(p.stock),
            q(p.shortDescription), q(p.description), q(p.description_mn), q(p.ratingsAvg),
            q(p.reviewCount), b(p.restricted), q(p.restrictedNote), j(p.specifications),
            j(p.additionalCategories), j(p.categoryPath), j(p.images),
            q(p.lastScraped), q(p.createdAt), q(p.updatedAt)
        ];
        const v = `(${row.join(', ')})`;
        if (buf.length && bufLen + v.length > MAX) flush();
        buf.push(v);
        bufLen += v.length + 2;
    }
    flush();

    const seedDir = path.join(ROOT_DIR, 'cloudflare', 'seed');
    fs.mkdirSync(seedDir, { recursive: true });
    const sqlFile = path.join(seedDir, 'sync-products.sql');
    fs.writeFileSync(sqlFile, out, 'utf8');

    try {
        const wranglerConfig = path.join(ROOT_DIR, 'cloudflare', 'wrangler.toml');
        execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', [
            'wrangler', 'd1', 'execute', 'costco', '-c', wranglerConfig, `--file=${sqlFile}`, '--remote'
        ], { cwd: ROOT_DIR, stdio: 'inherit' });
        console.log(`☁️  Synced ${normalized.length} products to Cloudflare D1 via Wrangler.`);
        return { synced: normalized.length };
    } catch (err) {
        console.warn(`⚠️ Wrangler D1 execution skipped or failed (${err.message}). SQL saved at ${sqlFile}`);
        return { synced: 0, sqlFile };
    }
}

// Standalone CLI execution: sync catalog & settings from Firestore (or local Costco.co.kr snapshot) to Cloudflare D1
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
    (async () => {
        console.log('🔄 Starting Catalog → Cloudflare D1 sync...');
        const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(ROOT_DIR, 'functions', 'service-account.json');
        if (!fs.existsSync(saPath) && !process.env.FIREBASE_SERVICE_ACCOUNT) {
            const snapshotFile = path.join(ROOT_DIR, 'public', 'home-snapshot.json');
            const searchIndexFile = path.join(ROOT_DIR, 'public', 'search-index.json');
            const byId = new Map();
            if (fs.existsSync(searchIndexFile)) {
                try {
                    const idxData = JSON.parse(fs.readFileSync(searchIndexFile, 'utf8'));
                    for (const item of idxData.items || []) {
                        const id = String(item.id || item.c || '');
                        if (id) byId.set(id, item);
                    }
                } catch { /* ignore */ }
            }
            let wonRate = 0;
            if (fs.existsSync(snapshotFile)) {
                try {
                    const snapData = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
                    wonRate = Number(snapData.wonRate) || 0;
                    for (const p of snapData.products || []) {
                        const id = String(p.id || p.code || '');
                        if (id) byId.set(id, { ...(byId.get(id) || {}), ...p });
                    }
                } catch { /* ignore */ }
            }
            const products = Array.from(byId.values());
            if (products.length > 0) {
                console.log(`📦 Loaded ${products.length} products from local Costco.co.kr catalog.`);
                await syncProductsToD1(products);
                if (wonRate > 0) {
                    await syncSettingToD1('currency', { wonRate, updatedAt: new Date().toISOString() });
                }
                console.log('✅ Local Costco.co.kr Catalog → D1 sync complete.');
                process.exit(0);
            }
            console.log('ℹ️ No Firebase service account or local snapshot found; skipping D1 catalog sync.');
            process.exit(0);
        }
        const { initializeApp, cert } = await import('firebase-admin/app');
        const { getFirestore } = await import('firebase-admin/firestore');
        const sa = fs.existsSync(saPath)
            ? JSON.parse(fs.readFileSync(saPath, 'utf8'))
            : JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        initializeApp({ credential: cert(sa) });
        const dbId = process.env.FIRESTORE_DATABASE_ID;
        const db = dbId && dbId !== '(default)' ? getFirestore(dbId) : getFirestore();

        const snap = await db.collection('products').get();
        const products = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        console.log(`📦 Loaded ${products.length} products from Firestore.`);
        await syncProductsToD1(products);

        for (const settingId of ['currency', 'general']) {
            const sDoc = await db.collection('settings').doc(settingId).get();
            if (sDoc.exists) {
                await syncSettingToD1(settingId, sDoc.data());
            }
        }
        console.log('✅ Catalog & settings D1 sync complete.');
        process.exit(0);
    })().catch((err) => {
        console.error('❌ D1 sync failed:', err);
        process.exit(1);
    });
}
