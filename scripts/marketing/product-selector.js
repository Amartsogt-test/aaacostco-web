/**
 * Autonomous Product Selector (scripts/marketing/product-selector.js)
 *
 * Selects the highest-converting products for daily social media posts and Reels:
 *  - Avoids repeating any product posted within the last 14 days (`logs/marketing-history.json`).
 *  - Supports campaign types: `flash_sale`, `spotlight_reel`, `new_arrival`, `clearance`.
 *  - Computes exact KRW -> MNT prices and cargo estimates.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { getDisplayPricing, resolveDiscount } from '../../src/utils/pricing.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const SNAPSHOT_PATH = path.join(ROOT_DIR, 'public', 'home-snapshot.json');
const HISTORY_PATH = path.join(ROOT_DIR, 'logs', 'marketing-history.json');

const GROUND_RATE_PER_KG_KRW = 5000;
const AIR_RATE_PER_KG_KRW = 12000;

export function loadMarketingHistory() {
    if (!fs.existsSync(HISTORY_PATH)) {
        return { posts: [] };
    }
    try {
        const parsed = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
        return Array.isArray(parsed.posts) ? parsed : { posts: [] };
    } catch {
        return { posts: [] };
    }
}

export function saveMarketingHistory(entry) {
    const logsDir = path.dirname(HISTORY_PATH);
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }
    const history = loadMarketingHistory();
    history.posts.unshift({
        ...entry,
        publishedAt: entry.publishedAt || new Date().toISOString(),
    });
    // Keep last 500 entries
    history.posts = history.posts.slice(0, 500);
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2), 'utf8');
}

function getRecentlyPostedCodes(days = 14) {
    const history = loadMarketingHistory();
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const codes = new Set();
    for (const post of history.posts) {
        const ts = new Date(post.publishedAt || 0).getTime();
        if (ts >= cutoff && post.productCode) {
            codes.add(String(post.productCode));
        }
    }
    return codes;
}

export async function loadCatalogAndRate() {
    // 1. Try local snapshot first (fast, deterministic, contains 1,000+ real products)
    if (fs.existsSync(SNAPSHOT_PATH)) {
        try {
            const raw = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
            const wonRate = Number(raw.wonRate) > 0 ? Number(raw.wonRate) : 2.5;
            const products = Array.isArray(raw.products) ? raw.products : [];
            if (products.length > 0) {
                return { products, wonRate, source: 'home-snapshot.json' };
            }
        } catch {
            /* fallback to worker API */
        }
    }

    // 2. Fallback to Cloudflare Worker API
    const workerUrl = process.env.VITE_WORKER_URL || process.env.WORKER_URL;
    if (workerUrl) {
        try {
            const res = await axios.get(`${workerUrl.replace(/\/$/, '')}/api/products?limit=200`, {
                timeout: 15000,
            });
            const products = Array.isArray(res.data?.products) ? res.data.products : [];
            return { products, wonRate: 2.5, source: 'worker-api' };
        } catch {
            /* ignore */
        }
    }

    return { products: [], wonRate: 2.5, source: 'empty' };
}

export function enrichProductPricing(prod, wonRate) {
    const code = String(prod.code || prod.id || '').trim();
    const pricing = getDisplayPricing(prod, {
        currency: 'MNT',
        wonRate,
        useWarehousePrice: true,
    });
    const discountInfo = resolveDiscount({
        displayPrice: pricing.displayPrice,
        displayOldPrice: pricing.displayOldPrice,
        isExpired: pricing.isExpired,
        hasDiscount: Boolean(prod.hasDiscount),
        discountValue: prod.discountPercent || prod.discount,
    });

    const priceKRW = pricing.mainPriceKRW;
    const originalPriceKRW = pricing.oldPriceInKRW || priceKRW;
    const discountKRW = Math.max(0, originalPriceKRW - priceKRW);
    const discountPercent = discountInfo.isDiscounted ? Number(discountInfo.percent || 0) : 0;

    const priceMNT = Math.round(pricing.displayPrice / 100) * 100;
    const oldPriceMNT = discountInfo.comparisonOldPrice
        ? Math.round(discountInfo.comparisonOldPrice / 100) * 100
        : priceMNT;
    const savingsMNT = Math.max(0, oldPriceMNT - priceMNT);

    const weightKg = Math.max(0.2, Number(prod.weight || 1.0));
    const groundCargoMNT = Math.round((weightKg * GROUND_RATE_PER_KG_KRW * wonRate) / 100) * 100;
    const airCargoMNT = Math.round((weightKg * AIR_RATE_PER_KG_KRW * wonRate) / 100) * 100;

    return {
        ...prod,
        code,
        titleMn: prod.name_mn || prod.name || prod.englishName || `Costco Бараа #${code}`,
        titleKr: prod.name || prod.englishName || '',
        priceKRW,
        originalPriceKRW,
        discountKRW,
        discountPercent,
        wonRate,
        priceMNT,
        oldPriceMNT,
        savingsMNT,
        weightKg,
        groundCargoMNT,
        airCargoMNT,
        productUrl: `https://costco.mn/product/${code}`,
    };
}

export async function selectProductsForCampaign({ type = 'flash_sale', count = 1 } = {}) {
    const { products, wonRate, source } = await loadCatalogAndRate();
    const recentCodes = getRecentlyPostedCodes(14);

    // Filter active products with valid image and positive price
    const candidates = products
        .filter((p) => {
            const code = String(p.code || p.id || '');
            const price = Number(p.price || p.priceKRW || 0);
            return (
                code &&
                price > 0 &&
                p.image &&
                p.status !== 'inactive' &&
                p.stock !== 'outOfStock' &&
                !recentCodes.has(code)
            );
        })
        .map((p) => enrichProductPricing(p, wonRate));

    let sorted = [];
    if (type === 'flash_sale') {
        sorted = [...candidates].sort((a, b) => {
            if (b.discountPercent !== a.discountPercent) return b.discountPercent - a.discountPercent;
            return b.savingsMNT - a.savingsMNT;
        });
    } else if (type === 'spotlight_reel') {
        sorted = [...candidates].sort((a, b) => {
            const aKirk = Array.isArray(a.additionalCategories) && a.additionalCategories.some((c) => c.includes('Kirkland') || c === 'Featured') ? 1 : 0;
            const bKirk = Array.isArray(b.additionalCategories) && b.additionalCategories.some((c) => c.includes('Kirkland') || c === 'Featured') ? 1 : 0;
            if (bKirk !== aKirk) return bKirk - aKirk;
            return b.discountPercent - a.discountPercent;
        });
    } else if (type === 'new_arrival') {
        sorted = [...candidates].sort((a, b) => {
            const aNew = Array.isArray(a.additionalCategories) && a.additionalCategories.includes('New') ? 1 : 0;
            const bNew = Array.isArray(b.additionalCategories) && b.additionalCategories.includes('New') ? 1 : 0;
            if (bNew !== aNew) return bNew - aNew;
            return b.priceMNT - a.priceMNT;
        });
    } else if (type === 'clearance') {
        sorted = [...candidates].sort((a, b) => {
            const aHasEnd = a.discountEndDate ? 1 : 0;
            const bHasEnd = b.discountEndDate ? 1 : 0;
            if (bHasEnd !== aHasEnd) return bHasEnd - aHasEnd;
            return b.savingsMNT - a.savingsMNT;
        });
    } else {
        sorted = candidates;
    }

    return {
        campaignType: type,
        source,
        wonRate,
        selected: sorted.slice(0, Math.max(1, count)),
    };
}
