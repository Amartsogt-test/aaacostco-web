/**
 * Autonomous Member-Only & Hidden-Price Backfill Script
 * (scripts/core/scrape-pdp-prices.js)
 *
 * Unlocks prices for Costco Korea products where `hidePriceValue=true` or `price <= 0`.
 * Uses `ensureCostcoMemberSession()` (`Cookie` + `Authorization: bearer <token>`) to
 * fetch member prices directly from the authenticated OCC REST API, updating
 * `public/search-index.json`, `public/home-snapshot.json`, and (if configured) Firestore.
 *
 * Usage:
 *   node scripts/core/scrape-pdp-prices.js
 *   node scripts/core/scrape-pdp-prices.js --limit 100
 *   node scripts/core/scrape-pdp-prices.js --all-zero
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { ensureCostcoMemberSession } from './auth-cookie.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const SEARCH_INDEX_PATH = path.join(ROOT_DIR, 'public', 'search-index.json');
const SNAPSHOT_PATH = path.join(ROOT_DIR, 'public', 'home-snapshot.json');

const ALL_ZERO = process.argv.includes('--all-zero');
const limArg = process.argv.indexOf('--limit');
const LIMIT = limArg > -1 ? Number(process.argv[limArg + 1]) : 200;

async function initOptionalFirestore() {
    const saPath =
        process.env.GOOGLE_APPLICATION_CREDENTIALS ||
        path.join(ROOT_DIR, 'functions', 'service-account.json');
    if (!fs.existsSync(saPath)) return null;
    try {
        const adminModule = await import('firebase-admin');
        const admin = adminModule.default || adminModule;
        const sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));
        if (!admin.apps.length) {
            admin.initializeApp({ credential: admin.credential.cert(sa) });
        }
        return { db: admin.firestore(), admin };
    } catch {
        return null;
    }
}

async function run() {
    const session = await ensureCostcoMemberSession();
    if (!session.isAuthenticated) {
        console.error('❌ [PDP Price Sync] Could not establish authenticated Costco member session.');
        process.exit(1);
    }

    if (!fs.existsSync(SEARCH_INDEX_PATH)) {
        console.error('❌ [PDP Price Sync] public/search-index.json not found.');
        process.exit(1);
    }

    const indexObj = JSON.parse(fs.readFileSync(SEARCH_INDEX_PATH, 'utf8'));
    const items = Array.isArray(indexObj.items) ? indexObj.items : [];

    let targets = items.filter(
        (p) => p.s !== 'deleted' && !(Number(p.p) > 0) && (ALL_ZERO || !(Number(p.w) > 0))
    );
    if (LIMIT < targets.length) {
        targets = targets.slice(0, LIMIT);
    }

    console.log(`🎯 [PDP Price Sync] Found ${targets.length} zero-price target products to unlock.`);
    if (targets.length === 0) {
        console.log('✅ [PDP Price Sync] All catalog products already have valid prices.');
        return;
    }

    const fb = await initOptionalFirestore();
    let fixedCount = 0;

    for (let i = 0; i < targets.length; i += 1) {
        const target = targets[i];
        const code = String(target.c || target.id);
        try {
            const res = await axios.get(
                `https://www.costco.co.kr/rest/v2/korea/products/${encodeURIComponent(
                    code
                )}?fields=FULL&lang=ko&curr=KRW`,
                {
                    headers: {
                        Accept: 'application/json',
                        Cookie: session.cookie,
                        Authorization: session.authorization,
                        'User-Agent': session.userAgent,
                    },
                    timeout: 12000,
                }
            );
            const price = Number(res.data?.price?.value || 0);
            const basePrice = Number(res.data?.basePrice?.value || price);
            if (price > 0) {
                const markup = price > 100000 ? 0 : 2000;
                const warehouse = Math.max(0, price - markup);
                target.p = price;
                target.o = basePrice;
                target.d = basePrice > price;
                target.w = warehouse;
                target.mk = markup;
                fixedCount += 1;
                console.log(`[${i + 1}/${targets.length}] ${code}: ${price.toLocaleString()}₩ ✓`);

                if (fb?.db) {
                    await fb.db
                        .collection('products')
                        .doc(code)
                        .set(
                            {
                                price,
                                priceKRW: price,
                                originalPrice: basePrice,
                                originalPriceKRW: basePrice,
                                estimatedWarehousePrice: warehouse,
                                hasDiscount: basePrice > price,
                                pdpPrice: true,
                                updatedAt: new Date().toISOString(),
                            },
                            { merge: true }
                        )
                        .catch(() => null);
                }
            }
        } catch (err) {
            console.warn(`[${i + 1}/${targets.length}] ${code}: ${err.message}`);
        }
    }

    if (fixedCount > 0) {
        indexObj.version = Date.now();
        fs.writeFileSync(SEARCH_INDEX_PATH, JSON.stringify(indexObj), 'utf8');

        if (fs.existsSync(SNAPSHOT_PATH)) {
            try {
                const snap = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
                const byCode = new Map(items.map((it) => [String(it.c || it.id), it]));
                for (const prod of snap.products || []) {
                    const match = byCode.get(String(prod.code || prod.id));
                    if (match && match.p > 0) {
                        prod.price = match.p;
                        prod.priceKRW = match.p;
                        prod.originalPrice = match.o;
                        prod.originalPriceKRW = match.o;
                        prod.estimatedWarehousePrice = match.w;
                        prod.hasDiscount = Boolean(match.d);
                    }
                }
                fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snap), 'utf8');
            } catch {
                /* ignore */
            }
        }
    }

    console.log(`✅ [PDP Price Sync] Unlocked member prices for ${fixedCount}/${targets.length} products.`);
}

run().catch((err) => {
    console.error('❌ [PDP Price Sync] Fatal error:', err);
    process.exit(1);
});
