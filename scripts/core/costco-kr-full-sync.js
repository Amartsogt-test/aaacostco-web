/**
 * Autonomous Costco.co.kr Full Catalog Scraper & Sync Engine
 * (scripts/core/costco-kr-full-sync.js)
 *
 * Pulls live product catalog, prices (including Member-Only & Hidden-Price items),
 * discounts, stock status, and categories directly from Costco Korea's official
 * OCC REST API (`https://www.costco.co.kr/rest/v2/korea/products/search?fields=FULL`).
 *
 * Features:
 *  - Automatically authenticates as a Costco Korea Member (`ensureCostcoMemberSession`)
 *    sending both `Cookie` and `Authorization: bearer <token>` headers so products with
 *    `hidePriceValue: true` or `membershipRestrictionApplied: true` (Apple, Dyson, Samsung,
 *    Gold bars, luxury cosmetics, etc.) return their real member prices instead of `undefined`.
 *  - Covers all 4 Special Collections (`SpecialPriceOffers`, `BuyersPick`, `whatsnew`, `ks_all`)
 *    plus all 18 Costco Korea Main Categories (`cos_1` .. `cos_20`).
 *  - Backfills any remaining zero-price / member-only items via authenticated `/products/<code>?fields=FULL`.
 *  - Preserves existing Mongolian translations (`name_mn`, `description_mn`) and weights
 *    from `public/search-index.json` & `public/home-snapshot.json` (7,500+ products).
 *  - Translates brand-new Korean/English product titles into Mongolian via Gemini 2.5 Flash.
 *  - Rebuilds `public/home-snapshot.json` and `public/search-index.json` directly.
 *
 * Usage:
 *  node scripts/core/costco-kr-full-sync.js                # Full catalog sync
 *  node scripts/core/costco-kr-full-sync.js --mode=quick   # Fast sync (Special collections + top category pages)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import dotenv from 'dotenv';
import { ensureCostcoMemberSession } from './auth-cookie.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

dotenv.config({ path: path.join(ROOT_DIR, '.env.local') });
dotenv.config({ path: path.join(ROOT_DIR, 'scraper', '.env') });
dotenv.config();

const SNAPSHOT_PATH = path.join(ROOT_DIR, 'public', 'home-snapshot.json');
const SEARCH_INDEX_PATH = path.join(ROOT_DIR, 'public', 'search-index.json');
const LOGS_DIR = path.join(ROOT_DIR, 'logs');

const DEFAULT_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

export const SPECIAL_TARGETS = [
    { code: 'SpecialPriceOffers', tagName: 'Sale', label: 'Хямдралтай (Sale)', queryType: 'allCategories' },
    { code: 'BuyersPick', tagName: 'Featured', label: 'Онцлох (Featured)', queryType: 'allCategories' },
    { code: 'whatsnew', tagName: 'New', label: 'Шинэ (New)', queryType: 'allCategories' },
    { code: 'ks_all', tagName: 'Kirkland Signature', label: 'Kirkland Signature', queryType: 'category' },
];

export const MAIN_CATEGORIES = [
    { code: 'cos_1', label: 'Дижитал/ТВ/Компьютер' },
    { code: 'cos_2', label: 'Тавилга/Ор хөнжил' },
    { code: 'cos_3', label: 'Хүүхэд/Тоглоом/Амьтан' },
    { code: 'cos_4', label: 'Спорт/Аялал/Кемпинг' },
    { code: 'cos_5', label: 'Зуслан/Цэцэрлэг' },
    { code: 'cos_6', label: 'Хувцас/Цүнх/Бусад' },
    { code: 'cos_7', label: 'Үнэт эдлэл/Цаг' },
    { code: 'cos_8', label: 'Гоо сайхан' },
    { code: 'cos_9', label: 'Багаж/Ахуй/Авто' },
    { code: 'cos_10', label: 'Хүнс' },
    { code: 'cos_11', label: 'Бичиг хэрэг/Оффис' },
    { code: 'cos_12', label: 'Эрүүл мэнд/Нэмэлт' },
    { code: 'cos_14', label: 'Ахуйн цахилгаан' },
    { code: 'cos_15', label: 'Гэр/Гал тогоо' },
    { code: 'cos_17', label: 'Бизнес хүргэлт' },
    { code: 'cos_18', label: 'Гросери' },
    { code: 'cos_19', label: 'Дугуй' },
    { code: 'cos_20', label: 'Авто хэрэгсэл' },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fixImageUrl(url) {
    if (!url) return '';
    return url.startsWith('http') ? url : `https://www.costco.co.kr${url}`;
}

/**
 * Parse weight in kg from product title or averageWeight field (e.g., "1.5kg", "500g x 6", "2L").
 */
export function estimateWeightKg(name = '', englishName = '', existingWeight = 0) {
    if (Number.isFinite(existingWeight) && existingWeight > 0 && existingWeight <= 200) {
        return existingWeight;
    }
    const text = `${name} ${englishName}`.toLowerCase();

    // Match patterns like "500g x 6" or "350ml x 24"
    const multiMatch = text.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\s*[x×*]\s*(\d+)/i);
    if (multiMatch) {
        const val = parseFloat(multiMatch[1]);
        const unit = multiMatch[2].toLowerCase();
        const count = parseInt(multiMatch[3], 10);
        const total = val * count;
        if (unit === 'kg' || unit === 'l') return Math.min(150, Math.max(0.2, Number((total * 1.08).toFixed(2))));
        if (unit === 'g' || unit === 'ml') return Math.min(150, Math.max(0.2, Number(((total / 1000) * 1.08).toFixed(2))));
    }

    // Match single weight "1.5kg", "800g", "2l"
    const singleMatch = text.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/i);
    if (singleMatch) {
        const val = parseFloat(singleMatch[1]);
        const unit = singleMatch[2].toLowerCase();
        if (unit === 'kg' || unit === 'l') return Math.min(150, Math.max(0.2, Number((val * 1.08).toFixed(2))));
        if (unit === 'g' || unit === 'ml') return Math.min(150, Math.max(0.2, Number(((val / 1000) * 1.08).toFixed(2))));
    }

    return 1.0;
}

function ingestSearchIndexItems(map, items = []) {
    for (const item of items) {
        const code = String(item.c || item.id || '').trim();
        if (!code || item.s === 'deleted') continue;

        const prev = map.get(code) || {};
        const onlinePrice = Number(item.p || prev.price || 0);
        const warehousePrice = Number(item.w || prev.estimatedWarehousePrice || 0);
        const markup = Number(item.mk ?? (warehousePrice > 100000 ? 0 : 2000));
        const effectivePrice = onlinePrice > 0 ? onlinePrice : warehousePrice > 0 ? warehousePrice + markup : 0;

        map.set(code, {
            ...prev,
            id: code,
            code,
            name: item.n || prev.name || '',
            name_mn: item.m || prev.name_mn || '',
            englishName: item.e || prev.englishName || '',
            brand: item.b || prev.brand || '',
            image: item.i || prev.image || '',
            price: effectivePrice,
            priceKRW: effectivePrice,
            originalPrice: Number(item.o || prev.originalPrice || effectivePrice),
            originalPriceKRW: Number(item.o || prev.originalPrice || effectivePrice),
            hasDiscount: Boolean(item.d ?? prev.hasDiscount),
            status: item.s || prev.status || 'active',
            categoryCode: item.cat || prev.categoryCode || '',
            additionalCategories: Array.isArray(item.ac) ? item.ac : prev.additionalCategories || [],
            estimatedWarehousePrice:
                warehousePrice > 0
                    ? warehousePrice
                    : effectivePrice > 0
                    ? Math.max(0, effectivePrice - (effectivePrice > 100000 ? 0 : 2000))
                    : 0,
            estimatedMarkupKrw: markup,
            description_mn: item.sm || prev.description_mn || '',
            weight: Number(prev.weight || estimateWeightKg(item.n, item.e, 0)),
        });
    }
}

/**
 * Load existing translations & metadata from search-index.json, home-snapshot.json,
 * and (if available) live CDN search-index.json so previously hidden-price or warehouse-only
 * items are never lost.
 */
async function loadExistingCatalogCache() {
    const map = new Map();
    let wonRate = 2.5;
    let categories = [];

    // 1. Seed from live CDN search-index if reachable (recovers any historical warehouse-only items)
    try {
        const cdnRes = await axios.get('https://costco-fe034.web.app/search-index.json', { timeout: 8000 });
        const cdnItems = Array.isArray(cdnRes.data) ? cdnRes.data : cdnRes.data?.items || [];
        ingestSearchIndexItems(map, cdnItems);
    } catch {
        /* offline or unreachable — local files used below */
    }

    // 2. Load local search-index.json
    if (fs.existsSync(SEARCH_INDEX_PATH)) {
        try {
            const idx = JSON.parse(fs.readFileSync(SEARCH_INDEX_PATH, 'utf8'));
            ingestSearchIndexItems(map, idx.items || []);
        } catch {
            /* ignore */
        }
    }

    // 3. Load local home-snapshot.json
    if (fs.existsSync(SNAPSHOT_PATH)) {
        try {
            const snap = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
            if (Number(snap.wonRate) > 0) wonRate = Number(snap.wonRate);
            if (Array.isArray(snap.categories)) categories = snap.categories;
            for (const prod of snap.products || []) {
                const code = String(prod.code || prod.id || '').trim();
                if (!code) continue;
                const prev = map.get(code) || {};
                map.set(code, {
                    ...prev,
                    ...prod,
                    code,
                    id: code,
                    name_mn: prod.name_mn || prev.name_mn || '',
                    weight: Number(prod.weight || prev.weight || 1.0),
                });
            }
        } catch {
            /* ignore */
        }
    }

    return { map, wonRate, categories };
}

function buildCostcoHeaders(memberSession = null) {
    const headers = {
        Accept: 'application/json',
        'User-Agent': memberSession?.userAgent || DEFAULT_UA,
    };
    if (memberSession?.cookie) {
        headers.Cookie = memberSession.cookie;
    }
    if (memberSession?.authorization) {
        headers.Authorization = memberSession.authorization;
    }
    return headers;
}

async function fetchCostcoSearchPage(query, page = 0, pageSize = 100, memberSession = null, retries = 3) {
    const url = `https://www.costco.co.kr/rest/v2/korea/products/search?fields=FULL&query=${encodeURIComponent(
        query
    )}&pageSize=${pageSize}&currentPage=${page}&lang=ko&curr=KRW`;

    for (let attempt = 1; attempt <= retries; attempt += 1) {
        try {
            const res = await axios.get(url, {
                headers: buildCostcoHeaders(memberSession),
                timeout: 20000,
            });
            return res.data;
        } catch (err) {
            if (attempt === retries) {
                console.warn(`⚠️ [Costco-KR] Failed query=${query} page=${page}: ${err.message}`);
                return null;
            }
            await sleep(600 * attempt);
        }
    }
    return null;
}

async function fetchCostcoProductDetail(code, memberSession = null, retries = 2) {
    const url = `https://www.costco.co.kr/rest/v2/korea/products/${encodeURIComponent(
        code
    )}?fields=FULL&lang=ko&curr=KRW`;
    for (let attempt = 1; attempt <= retries; attempt += 1) {
        try {
            const res = await axios.get(url, {
                headers: buildCostcoHeaders(memberSession),
                timeout: 15000,
            });
            return res.data;
        } catch {
            if (attempt < retries) await sleep(400 * attempt);
        }
    }
    return null;
}

function extractCategoriesFromPlp(raw, fallbackCatCode = '') {
    const plpCats = Array.isArray(raw.addToCartFromPLPCategories) ? raw.addToCartFromPLPCategories : [];
    const rawCats = Array.isArray(raw.categories) ? raw.categories : [];
    const cosCodes = [
        ...plpCats.map((c) => String(c?.key || '')),
        ...rawCats.map((c) => String(c?.code || '')),
    ].filter((k) => /^cos_\d+(\.\d+)*$/.test(k));

    let mainCategory = fallbackCatCode && fallbackCatCode.startsWith('cos_') ? fallbackCatCode : '';
    let subCategory = '';

    for (const code of cosCodes) {
        const topMatch = code.match(/^(cos_\d+)/);
        if (topMatch && !mainCategory) {
            mainCategory = topMatch[1];
        }
        if (code.split('.').length > subCategory.split('.').length) {
            subCategory = code;
        }
    }

    return {
        categoryCode: mainCategory || 'cos_10',
        subCategory: subCategory || mainCategory || 'cos_10',
        allCosCodes: cosCodes,
    };
}

function mapRawCostcoProduct(raw, existing = {}, specialTag = null, fallbackCatCode = '') {
    const code = String(raw.code || existing.code || '').trim();
    const rawPrice = Number(raw.price?.value || 0);
    const existingPrice = Number(existing.price || existing.priceKRW || 0);
    const existingWarehouse = Number(existing.estimatedWarehousePrice || 0);
    const existingMarkup = Number(existing.estimatedMarkupKrw ?? (existingWarehouse > 100000 ? 0 : 2000));
    const warehouseDerivedPrice = existingWarehouse > 0 ? existingWarehouse + existingMarkup : 0;

    const priceKRW = rawPrice || existingPrice || warehouseDerivedPrice || 0;
    const basePriceKRW = Number(raw.basePrice?.value || priceKRW);
    const couponDiscountVal = Number(raw.couponDiscount?.discountValue || 0);

    const originalPriceKRW =
        basePriceKRW > priceKRW
            ? basePriceKRW
            : couponDiscountVal > 0
            ? priceKRW + couponDiscountVal
            : Number(existing.originalPrice || priceKRW);

    const hasDiscount = originalPriceKRW > priceKRW && priceKRW > 0;
    const discountKRW = hasDiscount ? originalPriceKRW - priceKRW : 0;
    const discountPercent = hasDiscount ? Math.round((discountKRW / originalPriceKRW) * 100) : 0;
    const discountEndDate = raw.couponDiscount?.discountEndDate || existing.discountEndDate || null;

    const defaultMarkup = priceKRW > 100000 ? 0 : 2000;
    const estimatedWarehousePrice =
        rawPrice > 0
            ? Math.max(0, rawPrice - defaultMarkup)
            : existingWarehouse > 0
            ? existingWarehouse
            : Math.max(0, priceKRW - defaultMarkup);

    let imageUrl = existing.image || '';
    if (Array.isArray(raw.images) && raw.images.length > 0) {
        const mainImg = raw.images.find((i) => i.format === 'product') || raw.images[0];
        const freshUrl = mainImg ? fixImageUrl(mainImg.url) : '';
        if (!/storage\.googleapis\.com|firebasestorage\.googleapis\.com/.test(imageUrl)) {
            imageUrl = freshUrl || imageUrl;
        }
    }

    const { categoryCode, subCategory } = extractCategoriesFromPlp(
        raw,
        fallbackCatCode || existing.categoryCode || existing.category
    );

    const isMemberRestricted = Boolean(
        raw.membershipRestrictionApplied || raw.hidePriceValue || existing.memberOnly
    );

    const tagSet = new Set(Array.isArray(existing.additionalCategories) ? existing.additionalCategories : []);
    if (specialTag) tagSet.add(specialTag);
    if (hasDiscount) {
        tagSet.add('Sale');
        tagSet.add('Хямдралтай');
    } else if (!specialTag || specialTag !== 'Sale') {
        tagSet.delete('Sale');
        tagSet.delete('Хямдралтай');
    }

    const stockStatus = raw.stock?.stockLevelStatus || 'inStock';
    const weight = estimateWeightKg(raw.name, raw.englishName, Number(existing.weight || 0));

    const existingMn = existing.name_mn && !/[가-힣]/.test(existing.name_mn) ? existing.name_mn : '';

    return {
        id: code,
        code,
        name: raw.name || existing.name || '',
        name_mn: existingMn || raw.englishName || existing.name_mn || raw.name || '',
        englishName: raw.englishName || existing.englishName || '',
        brand:
            raw.manufacturer ||
            existing.brand ||
            (String(raw.englishName || '').startsWith('Kirkland') ? 'Kirkland Signature' : 'Costco'),
        image: imageUrl,
        price: priceKRW,
        priceKRW,
        originalPrice: originalPriceKRW,
        originalPriceKRW,
        estimatedWarehousePrice,
        estimatedMarkupKrw: defaultMarkup,
        hasDiscount,
        discount: discountKRW,
        discountPercent,
        discountEndDate,
        category: categoryCode,
        categoryCode,
        subCategory,
        categoryPath: [categoryCode, subCategory].filter(Boolean),
        additionalCategories: Array.from(tagSet),
        memberOnly: isMemberRestricted,
        status: stockStatus === 'outOfStock' ? 'inactive' : 'active',
        stock: stockStatus,
        weight,
        ratingsAvg: Number(raw.averageRating || existing.ratingsAvg || 0),
        reviewCount: Number(raw.numberOfReviews || existing.reviewCount || 0),
        description_mn: existing.description_mn || '',
        updatedAt: new Date().toISOString(),
    };
}

async function translateBatchViaGoogle(batch) {
    if (!batch || batch.length === 0) return [];
    const lines = batch.map((p) => String(p.englishName || p.name || '').replace(/\r?\n/g, ' ').trim());
    const joined = lines.join('\n');
    if (!joined.trim()) return [];
    try {
        const res = await axios.get(
            `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=mn&dt=t&q=${encodeURIComponent(
                joined
            )}`,
            {
                headers: { 'User-Agent': DEFAULT_UA },
                timeout: 12000,
            }
        );
        if (Array.isArray(res.data?.[0])) {
            const fullText = res.data[0].map((part) => part[0]).join('');
            return fullText.split('\n').map((s) => s.trim());
        }
    } catch {
        /* ignore */
    }
    return [];
}

async function translateMissingNamesBatch(productsToTranslate) {
    if (productsToTranslate.length === 0) return 0;

    let translatedCount = 0;
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    let geminiWorking = Boolean(apiKey);
    const batchSize = 25;

    for (let i = 0; i < Math.min(productsToTranslate.length, 200); i += batchSize) {
        const batch = productsToTranslate.slice(i, i + batchSize);
        if (geminiWorking) {
            const prompt = [
                'Дараах Солонгос/Англи барааны нэрсийг худалдааны сайтад зориулж цэвэрхэн, ойлгомжтой Монгол хэл рүү орчуулна уу.',
                'Зөвхөн JSON массив хэлбэрээр [{"code":"...","name_mn":"..."}] буцаана уу:',
                JSON.stringify(batch.map((p) => ({ code: p.code, name: p.name, en: p.englishName }))),
            ].join('\n');

            try {
                const res = await axios.post(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
                    {
                        contents: [{ role: 'user', parts: [{ text: prompt }] }],
                        generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
                    },
                    { timeout: 20000 }
                );
                const rawJson = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
                const parsed = JSON.parse(rawJson || '[]');
                if (Array.isArray(parsed)) {
                    const byCode = new Map(parsed.map((item) => [String(item.code), item.name_mn]));
                    for (const prod of batch) {
                        const mn = byCode.get(String(prod.code));
                        if (mn && mn.trim()) {
                            prod.name_mn = mn.trim();
                            translatedCount += 1;
                        }
                    }
                    continue;
                }
            } catch {
                geminiWorking = false;
            }
        }

        // Single-request multi-line Google Translate fallback for this batch
        const results = await translateBatchViaGoogle(batch);
        for (let idx = 0; idx < batch.length; idx += 1) {
            const mn = results[idx];
            if (mn) {
                batch[idx].name_mn = mn;
                translatedCount += 1;
            }
        }
        await sleep(300);
    }
    return translatedCount;
}

export async function runCostcoKrCatalogSync({ maxPagesPerCategory = 2 } = {}) {
    if (!fs.existsSync(LOGS_DIR)) {
        fs.mkdirSync(LOGS_DIR, { recursive: true });
    }

    // 0. Ensure authenticated Costco Korea member session so hidden-price / member-only products are visible
    const memberSession = await ensureCostcoMemberSession();
    console.log(
        `🔐 [Costco.co.kr Sync] Member session active: ${Boolean(memberSession?.isAuthenticated)} (${
            memberSession?.memberEmail || 'guest'
        })`
    );

    console.log('🇰🇷 [Costco.co.kr Sync] Loading existing catalog cache & Mongolian translations...');
    const { map: catalogMap, wonRate, categories } = await loadExistingCatalogCache();
    console.log(`📚 [Costco.co.kr Sync] Loaded ${catalogMap.size} existing products (wonRate=${wonRate}).`);

    const newlyDiscovered = [];
    let totalFetchedFromCostco = 0;
    let memberHiddenUnlockedCount = 0;

    // 1. Scrape all 4 Special Collections (Sale, Featured, New, Kirkland Signature)
    for (const target of SPECIAL_TARGETS) {
        let page = 0;
        let totalPages = 1;
        let targetFetched = 0;

        while (page < totalPages && page < Math.max(maxPagesPerCategory, 5)) {
            const query = `:relevance:${target.queryType}:${target.code}`;
            const data = await fetchCostcoSearchPage(query, page, 100, memberSession);
            if (!data || !Array.isArray(data.products) || data.products.length === 0) break;

            if (data.pagination?.totalPages) {
                totalPages = data.pagination.totalPages;
            }

            for (const raw of data.products) {
                if (!raw?.code) continue;
                const code = String(raw.code);
                const existing = catalogMap.get(code);
                if (raw.membershipRestrictionApplied || raw.hidePriceValue === false) {
                    memberHiddenUnlockedCount += 1;
                }
                const mapped = mapRawCostcoProduct(raw, existing, target.tagName, '');
                if (!existing || !existing.name_mn) {
                    newlyDiscovered.push(mapped);
                }
                catalogMap.set(code, mapped);
                targetFetched += 1;
                totalFetchedFromCostco += 1;
            }

            page += 1;
            await sleep(80);
        }
        console.log(`✅ [Costco.co.kr Sync] ${target.label}: synced ${targetFetched} live products.`);
    }

    // 2. Scrape all 18 Main Categories (cos_1 .. cos_20)
    for (const cat of MAIN_CATEGORIES) {
        let page = 0;
        let totalPages = 1;
        let catFetched = 0;

        while (page < totalPages && page < maxPagesPerCategory) {
            const query = `:relevance:allCategories:${cat.code}`;
            const data = await fetchCostcoSearchPage(query, page, 100, memberSession);
            if (!data || !Array.isArray(data.products) || data.products.length === 0) break;

            if (data.pagination?.totalPages) {
                totalPages = data.pagination.totalPages;
            }

            for (const raw of data.products) {
                if (!raw?.code) continue;
                const code = String(raw.code);
                const existing = catalogMap.get(code);
                const mapped = mapRawCostcoProduct(raw, existing, null, cat.code);
                if (!existing || !existing.name_mn) {
                    newlyDiscovered.push(mapped);
                }
                catalogMap.set(code, mapped);
                catFetched += 1;
                totalFetchedFromCostco += 1;
            }

            page += 1;
            await sleep(80);
        }
        console.log(`📂 [Costco.co.kr Sync] Category ${cat.code} (${cat.label}): synced ${catFetched} products.`);
    }

    // 3. Backfill any remaining zero-price items via authenticated individual product detail endpoint
    const zeroPriceCandidates = Array.from(catalogMap.values()).filter(
        (p) => p.status === 'active' && !(p.price > 0) && !(p.estimatedWarehousePrice > 0)
    );
    let backfilledZeroPrices = 0;
    if (zeroPriceCandidates.length > 0 && memberSession?.isAuthenticated) {
        console.log(
            `🔍 [Costco.co.kr Sync] Backfilling ${zeroPriceCandidates.length} zero-price member-only items via authenticated PDP API...`
        );
        const batchSize = 10;
        for (let i = 0; i < Math.min(zeroPriceCandidates.length, 120); i += batchSize) {
            const batch = zeroPriceCandidates.slice(i, i + batchSize);
            const details = await Promise.all(
                batch.map((item) => fetchCostcoProductDetail(item.code, memberSession))
            );
            for (const detail of details) {
                if (detail?.code && Number(detail.price?.value) > 0) {
                    const code = String(detail.code);
                    const existing = catalogMap.get(code);
                    const updated = mapRawCostcoProduct(detail, existing, null, existing?.categoryCode || '');
                    catalogMap.set(code, updated);
                    backfilledZeroPrices += 1;
                }
            }
            await sleep(80);
        }
        console.log(`🔓 [Costco.co.kr Sync] Unlocked member prices for ${backfilledZeroPrices} previously zero-price items.`);
    }

    // 4. Translate any newly discovered or still-Korean products lacking Mongolian titles
    const needsTranslation = Array.from(catalogMap.values()).filter(
        (p) => p.status === 'active' && (!p.name_mn || /[가-힣]/.test(p.name_mn))
    );
    if (needsTranslation.length > 0 || newlyDiscovered.length > 0) {
        const targetList = needsTranslation.length > 0 ? needsTranslation : newlyDiscovered;
        const translated = await translateMissingNamesBatch(targetList);
        console.log(
            `🌐 [Costco.co.kr Sync] Untranslated items: ${targetList.length} (Translated to Mongolian: ${translated}).`
        );
    }

    // 5. Rebuild public/home-snapshot.json & public/search-index.json
    // Keep all active products that have either an online price OR an estimatedWarehousePrice
    const allProducts = Array.from(catalogMap.values()).filter(
        (p) => (p.price > 0 || p.estimatedWarehousePrice > 0) && p.status === 'active'
    );

    // Compute categoryCounts
    const categoryCounts = {};
    for (const cat of MAIN_CATEGORIES) {
        categoryCounts[cat.code] = 0;
    }
    categoryCounts.Sale = 0;
    categoryCounts.Featured = 0;
    categoryCounts.Kirkland = 0;
    categoryCounts.New = 0;

    for (const p of allProducts) {
        const catCode = String(p.categoryCode || p.category || '');
        if (catCode && categoryCounts[catCode] !== undefined) {
            categoryCounts[catCode] += 1;
        }
        const tags = Array.isArray(p.additionalCategories) ? p.additionalCategories : [];
        if (tags.includes('Sale') || p.hasDiscount) categoryCounts.Sale += 1;
        if (tags.includes('Featured')) categoryCounts.Featured += 1;
        if (tags.includes('Kirkland Signature')) categoryCounts.Kirkland += 1;
        if (tags.includes('New')) categoryCounts.New += 1;
    }

    // Prioritize Featured, Sale, and New items for the home-snapshot grid (up to 1,200 products)
    // Strip heavy description_mn and duplicate keys from card items so home-snapshot.json stays fast (~500 KB raw / ~110 KB gzip)
    const sortedForHome = [...allProducts]
        .sort((a, b) => {
            const aScore =
                (a.hasDiscount ? 4 : 0) +
                (a.additionalCategories?.includes('Featured') ? 3 : 0) +
                (a.additionalCategories?.includes('New') ? 2 : 0);
            const bScore =
                (b.hasDiscount ? 4 : 0) +
                (b.additionalCategories?.includes('Featured') ? 3 : 0) +
                (b.additionalCategories?.includes('New') ? 2 : 0);
            if (bScore !== aScore) return bScore - aScore;
            return (b.discountPercent || 0) - (a.discountPercent || 0);
        })
        .slice(0, 1200)
        .map((p, idx) => {
            const card = { ...p, sortOrder: idx + 1 };
            delete card.description_mn;
            delete card.description;
            delete card.priceKRW;
            delete card.originalPriceKRW;
            return card;
        });

    const homeSnapshot = {
        generatedAt: new Date().toISOString(),
        productCount: sortedForHome.length,
        wonRate,
        categoryCounts,
        categories,
        products: sortedForHome,
    };
    fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(homeSnapshot), 'utf8');

    // Write slimmed public/search-index.json (omit 300-char sm description bloat so it fits easily in browser cache)
    const searchIndexItems = allProducts.map((p) => {
        const item = {
            id: p.code,
            n: p.name || '',
            m: p.name_mn || '',
            e: p.englishName || '',
            b: p.brand || '',
            i: p.image || '',
            p: p.price || 0,
            cat: p.categoryCode || '',
            w: p.estimatedWarehousePrice || 0,
        };
        if (p.originalPrice && p.originalPrice > p.price) item.o = p.originalPrice;
        if (p.hasDiscount) item.d = true;
        if (Array.isArray(p.additionalCategories) && p.additionalCategories.length > 0) item.ac = p.additionalCategories;
        const mk = Math.max(0, (p.price || 0) - (p.estimatedWarehousePrice || 0));
        if (mk > 0) item.mk = mk;
        if (p.weight > 0) item.wt = p.weight;
        if (p.ratingsAvg > 0) item.r = p.ratingsAvg;
        if (p.reviewCount > 0) item.rc = p.reviewCount;
        return item;
    });

    fs.writeFileSync(
        SEARCH_INDEX_PATH,
        JSON.stringify({
            version: Date.now(),
            totalItems: searchIndexItems.length,
            items: searchIndexItems,
        }),
        'utf8'
    );

    const summary = {
        syncedAt: new Date().toISOString(),
        memberAuthenticated: Boolean(memberSession?.isAuthenticated),
        memberEmail: memberSession?.memberEmail || null,
        totalFetchedFromCostco,
        memberHiddenUnlockedCount,
        backfilledZeroPrices,
        totalActiveCatalog: allProducts.length,
        homeSnapshotProducts: sortedForHome.length,
        searchIndexProducts: searchIndexItems.length,
        categoryCounts,
    };

    fs.writeFileSync(path.join(LOGS_DIR, 'costco-kr-sync-report.json'), JSON.stringify(summary, null, 2), 'utf8');
    console.log(
        `🎉 [Costco.co.kr Sync] Complete! Active catalog: ${allProducts.length} items, Home Snapshot: ${sortedForHome.length} items.`
    );
    return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    const isQuick = process.argv.includes('--mode=quick');
    runCostcoKrCatalogSync({ maxPagesPerCategory: isQuick ? 1 : 5 }).catch((err) => {
        console.error('❌ [Costco.co.kr Sync] Fatal error:', err);
        process.exit(1);
    });
}
