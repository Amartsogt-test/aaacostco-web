/**
 * Autonomous Order Aggregator & Costco.co.kr Auto-Cart Builder (scripts/core/auto-cart.js)
 *
 * 1. Fetches all `confirmed` customer orders from Cloudflare Worker Admin API (`/api/admin/orders`).
 * 2. Aggregates items by SKU (`productCode`), resolves true KRW prices from `public/search-index.json`,
 *    and separates them into:
 *    - Online Cart List (items available for online delivery on costco.co.kr)
 *    - Warehouse Picking List (chilled/frozen/in-store-only items grouped by category)
 * 3. Generates `logs/costco-purchase-plan.json` and `logs/warehouse-picking-list.md`.
 * 4. When `--apply-cart` or `--playwright` is passed, adds each online SKU with its exact
 *    `totalQuantity` via Costco Korea's OCC REST API (`logs/costco-member-session.json`), or
 *    connects to an existing Chrome session via CDP (never launching a new browser window).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const LOGS_DIR = path.join(ROOT_DIR, 'logs');

function ensureLogsDir() {
    if (!fs.existsSync(LOGS_DIR)) {
        fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
}

function loadCatalogLookupMap() {
    const map = new Map();
    const searchIdxPath = path.join(ROOT_DIR, 'public', 'search-index.json');
    if (fs.existsSync(searchIdxPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(searchIdxPath, 'utf8'));
            for (const item of data.items || []) {
                const code = String(item.id || item.c || '').trim();
                if (code) {
                    map.set(code, {
                        priceKRW: Number(item.p || item.w || 0),
                        warehousePriceKRW: Number(item.w || item.p || 0),
                        name: item.m || item.e || item.n || '',
                        category: item.cat || '',
                    });
                }
            }
        } catch {
            /* ignore */
        }
    }
    return map;
}

async function fetchConfirmedOrders() {
    const workerUrl = (
        process.env.VITE_API_BASE ||
        process.env.VITE_WORKER_URL ||
        process.env.WORKER_URL ||
        'https://costco-api.costcomn.workers.dev'
    ).replace(/\/$/, '');
    const syncSecret = process.env.ADMIN_SYNC_SECRET || process.env.INTERNAL_SYNC_SECRET || '';
    const adminToken = process.env.CF_ADMIN_TOKEN || '';

    if (workerUrl && (syncSecret || adminToken)) {
        try {
            const headers = {};
            if (syncSecret) headers['X-Admin-Sync-Secret'] = syncSecret;
            if (adminToken) headers['Authorization'] = `Bearer ${adminToken}`;
            const res = await axios.get(`${workerUrl}/api/admin/orders`, {
                headers,
                timeout: 15000,
            });
            if (Array.isArray(res.data?.orders)) {
                return res.data.orders.filter(
                    (o) => o && o.trackingStage === 'confirmed' && o.status !== 'Cancelled'
                );
            }
        } catch (err) {
            console.warn('⚠️ [Auto-Cart] Worker API fetch failed, checking local fallback:', err.message);
        }
    }

    const localOrdersFile = path.join(LOGS_DIR, 'confirmed-orders-cache.json');
    if (fs.existsSync(localOrdersFile)) {
        try {
            const cached = JSON.parse(fs.readFileSync(localOrdersFile, 'utf8'));
            return Array.isArray(cached)
                ? cached.filter((o) => !o.trackingStage || o.trackingStage === 'confirmed')
                : [];
        } catch {
            return [];
        }
    }

    return [];
}

function isWarehouseOnlyItem(item, catalogEntry) {
    if (item.warehouseOnly === true || item.productType === 'warehouse') return true;
    const name = `${item.name || ''} ${item.name_mn || ''} ${catalogEntry?.name || ''}`.toLowerCase();
    const cat = `${item.category || ''} ${item.categoryName || ''} ${catalogEntry?.category || ''}`.toLowerCase();
    return (
        name.includes('хөлдөөсөн') ||
        name.includes('хөргөөлсөн') ||
        name.includes('냉동') ||
        name.includes('냉장') ||
        cat.includes('cos_10.10') ||
        cat.includes('cos_10.13') ||
        cat.includes('cos_10.14')
    );
}

function buildPurchasePlan(orders, catalogMap) {
    const skuMap = new Map();

    for (const order of orders) {
        const items = Array.isArray(order.items) ? order.items : [];
        for (const rawItem of items) {
            const code = String(rawItem.code || rawItem.productId || rawItem.id || '').trim();
            if (!code) continue;

            const catInfo = catalogMap.get(code);
            const qty = Math.max(1, Number(rawItem.quantity || 1));
            const resolvedPriceKRW =
                Number(rawItem.priceKRW) ||
                Number(catInfo?.priceKRW) ||
                0;

            const existing = skuMap.get(code) || {
                code,
                name: rawItem.name_mn || rawItem.name || catInfo?.name || `Бараа #${code}`,
                priceKRW: resolvedPriceKRW,
                totalQuantity: 0,
                warehouseOnly: isWarehouseOnlyItem(rawItem, catInfo),
                category: rawItem.categoryName || rawItem.category || catInfo?.category || 'Ерөнхий',
                url: `https://www.costco.co.kr/p/${code}`,
                orderIds: [],
            };

            existing.totalQuantity += qty;
            if (order.id && !existing.orderIds.includes(order.id)) {
                existing.orderIds.push(order.id);
            }
            skuMap.set(code, existing);
        }
    }

    const allItems = Array.from(skuMap.values());
    const onlineCartItems = allItems.filter((item) => !item.warehouseOnly);
    const warehousePickingItems = allItems
        .filter((item) => item.warehouseOnly)
        .sort((a, b) => a.category.localeCompare(b.category));

    const totalEstimatedKRW = allItems.reduce(
        (sum, item) => sum + item.priceKRW * item.totalQuantity,
        0
    );

    return {
        generatedAt: new Date().toISOString(),
        orderCount: orders.length,
        totalUniqueSkus: allItems.length,
        totalEstimatedKRW,
        onlineCartItems,
        warehousePickingItems,
    };
}

function formatPickingListMarkdown(plan) {
    const lines = [
        '# 🛒 Costco.mn Автомат Татан Авалтын Төлөвлөгөө',
        `Огноо: ${plan.generatedAt}`,
        `Баталгаажсан захиалгын тоо: **${plan.orderCount}**`,
        `Нийт барааны төрөл (SKU): **${plan.totalUniqueSkus}**`,
        `Нийт тооцоолсон дүн (KRW): **₩${plan.totalEstimatedKRW.toLocaleString()}**`,
        '',
        '## 🌐 1. Costco.co.kr Онлайн Сагсанд Нэмэх Бараанууд',
    ];

    if (plan.onlineCartItems.length === 0) {
        lines.push('_Онлайнаар захиалах бараа одоогоор алга байна._');
    } else {
        for (const item of plan.onlineCartItems) {
            lines.push(
                `- [ ] **[${item.code}](${item.url})** — ${item.name} | Тоо: **${item.totalQuantity} ш** | ₩${item.priceKRW.toLocaleString()} (Захиалга: ${item.orderIds.join(', ')})`
            );
        }
    }

    lines.push('', '## 🏬 2. Сөүл Агуулах / Дэлгүүрээс Биеэр Цуглуулах Жагсаалт (Picking List)');
    if (plan.warehousePickingItems.length === 0) {
        lines.push('_Дэлгүүрээс биеэр авах бараа одоогоор алга байна._');
    } else {
        for (const item of plan.warehousePickingItems) {
            lines.push(
                `- [ ] **[${item.category}] #${item.code}** — ${item.name} | Тоо: **${item.totalQuantity} ш** | ₩${item.priceKRW.toLocaleString()}`
            );
        }
    }

    return lines.join('\n') + '\n';
}

async function addItemsToCostcoKrCart(onlineItems) {
    if (onlineItems.length === 0) {
        console.log('ℹ️ [Auto-Cart] No online items to add to Costco.co.kr cart.');
        return { added: 0, skipped: 0 };
    }

    const sessionFile = path.join(LOGS_DIR, 'costco-member-session.json');
    let session = null;
    if (fs.existsSync(sessionFile)) {
        try {
            session = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
        } catch {
            session = null;
        }
    }

    let added = 0;
    let skipped = 0;

    // 1. Primary path: Direct Costco Korea OCC REST API using verified session token/cookies
    if (session?.accessToken || session?.cookieHeader) {
        const headers = {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        };
        if (session.accessToken) headers['Authorization'] = `Bearer ${session.accessToken}`;
        if (session.cookieHeader) headers['Cookie'] = session.cookieHeader;
        if (session.csrfToken) headers['X-CSRF-Token'] = session.csrfToken;

        for (const item of onlineItems) {
            try {
                console.log(`🛒 [Auto-Cart API] Adding SKU ${item.code} (qty: ${item.totalQuantity})...`);
                const res = await axios.post(
                    'https://www.costco.co.kr/rest/v2/korea/users/current/carts/current/entries?lang=ko&curr=KRW',
                    {
                        product: { code: item.code },
                        quantity: item.totalQuantity,
                    },
                    { headers, timeout: 15000 }
                );
                if (res.status >= 200 && res.status < 300) {
                    added += 1;
                } else {
                    skipped += 1;
                }
            } catch (err) {
                console.warn(`⚠️ [Auto-Cart API] Could not add SKU ${item.code}:`, err.response?.data?.errors?.[0]?.message || err.message);
                skipped += 1;
            }
        }
        console.log(`✅ [Auto-Cart] Added ${added} SKUs to cart (${skipped} skipped).`);
        return { added, skipped };
    }

    console.warn('⚠️ [Auto-Cart] No active Costco member session found in logs/costco-member-session.json. Run auth-cookie.js first.');
    return { added: 0, skipped: onlineItems.length };
}

async function main() {
    ensureLogsDir();
    const applyCart = process.argv.includes('--playwright') || process.argv.includes('--apply-cart');

    console.log('📦 [Auto-Cart] Aggregating confirmed orders...');
    const catalogMap = loadCatalogLookupMap();
    const orders = await fetchConfirmedOrders();
    const plan = buildPurchasePlan(orders, catalogMap);

    const jsonPath = path.join(LOGS_DIR, 'costco-purchase-plan.json');
    const mdPath = path.join(LOGS_DIR, 'warehouse-picking-list.md');

    fs.writeFileSync(jsonPath, JSON.stringify(plan, null, 2), 'utf8');
    fs.writeFileSync(mdPath, formatPickingListMarkdown(plan), 'utf8');

    console.log(
        `✅ [Auto-Cart] Purchase plan ready: ${plan.orderCount} orders -> ${plan.onlineCartItems.length} online SKUs, ${plan.warehousePickingItems.length} warehouse SKUs.`
    );
    console.log(`📄 Saved JSON: ${jsonPath}`);
    console.log(`📄 Saved Picking List: ${mdPath}`);

    if (applyCart) {
        await addItemsToCostcoKrCart(plan.onlineCartItems);
    }
}

main();
