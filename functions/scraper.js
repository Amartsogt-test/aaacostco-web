/**
 * scraper.js — Costco Korea (costco.co.kr) product scraper.
 *
 * Pulls products from Costco's hybris/OCC REST API and upserts them into the
 * Firestore `products` collection. Three public entry points:
 *   • syncWithTargets(targets, admin)   — scrape a list of category targets.
 *   • syncSpecialCategories(admin)      — convenience wrapper (Sale/Featured/New/Kirkland).
 *   • fixZeroPriceProducts(admin, ids?) — re-fetch prices for items that have none.
 *
 * ⚠️ IMPORTANT (content negotiation): Costco's REST API returns XML unless the
 * request sends `Accept: application/json`. Missing that header makes JSON.parse
 * fail, so every detail fetch silently returns null and the price is never stored.
 * fetchJson() sets the header — do not remove it.
 */

const admin = require('firebase-admin');

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const DEFAULT_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * GET a Costco REST endpoint and parse the JSON body. Retries on failure.
 * Returns the parsed object, or null if every attempt failed.
 */
async function fetchJson(url, cookie = '', userAgent = '', retries = 3) {
    try {
        const headers = {
            // REQUIRED: without this the API replies with XML → JSON.parse throws →
            // the product (and its price) is dropped. This was the root cause of the
            // "Бэлэн бус" / zero-price products.
            Accept: 'application/json',
            'User-Agent': userAgent || DEFAULT_UA,
        };
        if (cookie) headers.Cookie = cookie;

        const response = await fetch(url, { headers });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (e) {
        if (retries > 0) {
            await sleep(500);
            return fetchJson(url, cookie, userAgent, retries - 1);
        }
        return null;
    }
}

/** Absolute-ize a Costco image path. */
function fixImageUrl(url) {
    if (!url) return '';
    return url.startsWith('http') ? url : `https://www.costco.co.kr${url}`;
}

/** Flatten hybris `classifications[].features[]` into [{ name, value }]. */
function extractSpecifications(classifications) {
    if (!Array.isArray(classifications)) return [];
    const specs = [];
    for (const classification of classifications) {
        if (!classification.features) continue;
        for (const feature of classification.features) {
            if (feature.name && feature.featureValues && feature.featureValues[0]) {
                specs.push({ name: feature.name, value: feature.featureValues[0].value || '' });
            }
        }
    }
    return specs;
}

// ---------------------------------------------------------------------------
// Category metadata
// ---------------------------------------------------------------------------

const CATEGORY_MAP = {
    SpecialPriceOffers: 'Sale',
    BuyersPick: 'Featured',
    whatsnew: 'New',
    ks_all: 'Kirkland Signature',
};

const SUBCATEGORY_MAP = {
    SpecialPriceOffers: 'Special Offers',
    BuyersPick: 'Buyers Pick',
    ks_all: 'Everything',
    whatsnew: 'New Arrivals',
};

const CATEGORY_NAMES = {
    Sale: 'Хямдралтай',
    Featured: 'Онцлох',
    'Kirkland Signature': 'Kirkland Signature',
    New: 'Шинэ',
};

function getCategoryName(target, catCode) {
    if (CATEGORY_MAP[catCode]) return CATEGORY_MAP[catCode];
    if (target && target.name) return target.name; // fall back to the menu-provided name
    return 'General';
}

// ---------------------------------------------------------------------------
// Product mapping (raw Costco JSON → our Firestore shape)
// ---------------------------------------------------------------------------

/**
 * Map one raw Costco product to our stored shape. Pure data transform — never
 * sets `status` (admin owns that; new-product status is set in the save logic).
 */
function mapAllFields(raw, target, effectiveAdmin = null) {
    const firebaseAdmin = effectiveAdmin || admin;
    const catCode = target.code;
    const product = { ...raw };

    product.id = raw.code;

    // Prices. hybris returns price/basePrice as objects { value, ... }.
    const priceValue = raw.price && typeof raw.price === 'object' ? raw.price.value : 0;
    const basePriceValue = raw.basePrice && typeof raw.basePrice === 'object' ? raw.basePrice.value : priceValue;
    product.price = priceValue;
    product.originalPrice = basePriceValue;

    // 🏪 Estimated warehouse (offline) price. Costco Online hides a ~2,000₩ shipping
    // markup on most items; high-value items (>100k) usually have none.
    const defaultMarkup = product.price > 100000 ? 0 : 2000;
    product.estimatedWarehousePrice = Math.max(0, product.price - defaultMarkup);

    product.hasDiscount = product.originalPrice > product.price;

    // Images.
    if (Array.isArray(raw.images)) {
        product.images = raw.images.map((img) => ({ ...img, url: fixImageUrl(img.url) }));
        const mainImg = raw.images.find((i) => i.format === 'product') || raw.images[0];
        product.image = mainImg ? fixImageUrl(mainImg.url) : '';
    }

    // Categories.
    product.category = getCategoryName(target, catCode);
    product.subCategory = SUBCATEGORY_MAP[catCode] || 'General';
    product.categoryName = CATEGORY_NAMES[product.category] || product.category;
    product.subCategoryName = product.subCategory;
    product.targetCode = catCode;
    product.additionalCategories = [
        product.category,
        product.subCategory,
        product.categoryName,
        raw.wcs_ag_id,
    ].filter(Boolean);

    // Per-category tagging.
    if (catCode === 'SpecialPriceOffers') {
        product.hasDiscount = true;
        if (!product.additionalCategories.includes('Sale')) product.additionalCategories.push('Sale');
        if (!product.additionalCategories.includes('Хямдралтай')) product.additionalCategories.push('Хямдралтай');
    }
    if (catCode === 'whatsnew' && !product.additionalCategories.includes('New')) {
        product.additionalCategories.push('New');
    }
    if (catCode === 'BuyersPick') {
        product.targetCode = 'BuyersPick';
        if (!product.additionalCategories.includes('Trend')) product.additionalCategories.push('Trend');
        if (!product.additionalCategories.includes('Featured')) product.additionalCategories.push('Featured');
    }
    if (catCode === 'ks_all') {
        product.targetCode = 'ks_all';
        if (!product.additionalCategories.includes('Kirkland Signature')) product.additionalCategories.push('Kirkland Signature');
    }

    product.specifications = extractSpecifications(raw.classifications);
    product.brand = raw.manufacturer || 'Costco';
    product.updatedAt = firebaseAdmin.firestore.FieldValue.serverTimestamp();
    product.lastScraped = new Date().toISOString();
    product.source = 'cloud_function_scraper';

    return product;
}

/** Fetch one product's FULL detail. */
async function fetchProductDetails(productCode, cookie, userAgent) {
    const url = `https://www.costco.co.kr/rest/v2/korea/products/${productCode}?fields=FULL`;
    return fetchJson(url, cookie, userAgent);
}

/** Fetch many products in parallel, `concurrency` at a time. Nulls are dropped. */
async function fetchProductsBatch(ids, cookie, userAgent, concurrency = 10) {
    const results = [];
    for (let i = 0; i < ids.length; i += concurrency) {
        const batch = ids.slice(i, i + concurrency);
        const settled = await Promise.all(
            batch.map((id) => fetchProductDetails(id, cookie, userAgent).catch(() => null))
        );
        results.push(...settled.filter((r) => r && r.code));
        await sleep(100);
    }
    return results;
}

// ---------------------------------------------------------------------------
// Shared utilities for the exported jobs
// ---------------------------------------------------------------------------

/** Resolve the Firestore instance, honouring FIRESTORE_DATABASE_ID (Asia migration). */
function getDb(baseAdmin) {
    const dbId = process.env.FIRESTORE_DATABASE_ID || '(default)';
    if (dbId === '(default)') return baseAdmin.firestore();
    return require('firebase-admin/firestore').getFirestore(baseAdmin.app(), dbId);
}

/** Read the scraper session cookie + user-agent from settings/scraper. */
async function getScraperAuth(db) {
    try {
        const snap = await db.collection('settings').doc('scraper').get();
        if (snap.exists) {
            const data = snap.data();
            return { cookie: data.cookie || '', userAgent: data.userAgent || '' };
        }
    } catch (e) {
        console.error('Failed to fetch scraper settings:', e);
    }
    return { cookie: '', userAgent: '' };
}

// ---------------------------------------------------------------------------
// Public: full category sync
// ---------------------------------------------------------------------------

exports.syncWithTargets = async (targets, adminInstance = null) => {
    const baseAdmin = adminInstance || admin;
    const db = getDb(baseAdmin);
    const serverTimestamp = () => baseAdmin.firestore.FieldValue.serverTimestamp();
    const statusRef = db.collection('system').doc('syncStatus');

    const { cookie, userAgent } = await getScraperAuth(db);
    console.log('Scraper auth — cookie len:', cookie.length, 'UA set:', !!userAgent);

    const steps = targets.map((t) => ({
        label: t.label, status: 'pending', processed: 0, total: 0, percentage: 0, dbCount: 0,
    }));

    let lastUpdate = 0;
    const saveStatus = async (isComplete = false) => {
        const now = Date.now();
        if (!isComplete && now - lastUpdate <= 2000) return; // throttle writes
        try {
            await statusRef.set({
                state: isComplete ? 'completed' : 'running',
                steps,
                lastUpdated: serverTimestamp(),
            });
            lastUpdate = now;
        } catch (e) {
            console.error('Progress update failed:', e);
        }
    };

    let totalSaved = 0;
    let totalFailed = 0;
    const log = [];
    await saveStatus();

    for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        log.push(`Scanning ${target.code}...`);

        // Count what we already have for this tag (informational).
        try {
            const snap = await db.collection('products')
                .where('additionalCategories', 'array-contains', target.tagName)
                .count().get();
            steps[i].dbCount = snap.data().count;
        } catch (e) {
            steps[i].dbCount = 0;
        }

        steps[i].status = 'running';
        await saveStatus();

        // 1) Collect every product code in this category (paginated; cap 20 pages).
        const ids = new Set();
        let page = 0;
        let totalPages = 1;
        while (page < totalPages && page < 20) {
            const queryType = target.type === 'allCategories' ? 'allCategories' : 'category';
            const query = `:relevance:${queryType}:${target.code}`;
            const url = `https://www.costco.co.kr/rest/v2/korea/products/search?fields=products(code),pagination&query=${encodeURIComponent(query)}&pageSize=100&currentPage=${page}`;
            const data = await fetchJson(url, cookie, userAgent);
            if (!data || !data.products) break;
            if (data.pagination) totalPages = data.pagination.totalPages;
            data.products.forEach((p) => ids.add(p.code));
            page++;
            await sleep(50);
        }

        const idArray = Array.from(ids);
        steps[i].total = idArray.length;
        log.push(`Found ${idArray.length} items for ${target.code}. Fetching...`);
        await saveStatus();

        // 2) Fetch details in parallel batches and upsert.
        const BATCH_SIZE = 15;
        let processed = 0;

        for (let start = 0; start < idArray.length; start += BATCH_SIZE) {
            const batchIds = idArray.slice(start, start + BATCH_SIZE);
            const details = await Promise.all(
                batchIds.map((id) => fetchProductDetails(id, cookie, userAgent).catch(() => null))
            );

            const batch = db.batch();
            let batchCount = 0;

            for (const detail of details) {
                if (!detail || !detail.code) { totalFailed++; continue; }

                const mapped = mapAllFields(detail, target, baseAdmin);
                const docRef = db.collection('products').doc(mapped.id);
                const existingDoc = await docRef.get();

                if (!existingDoc.exists) {
                    // New product: activate it, and seed name_mn = null so the
                    // translation step (which queries where name_mn == null) finds it.
                    mapped.status = 'active';
                    mapped.name_mn = null;
                } else {
                    const existing = existingDoc.data();

                    // Preserve a good existing price if this scrape returned 0
                    // (Costco hides the price on some items — hidePriceValue).
                    if (mapped.price === 0 && existing.price > 0) {
                        mapped.price = existing.price;
                        if (mapped.originalPrice === 0 && existing.originalPrice > 0) {
                            mapped.originalPrice = existing.originalPrice;
                        }
                        // Recompute warehouse estimate + discount from the RESTORED price.
                        // Without this, mapped.estimatedWarehousePrice (computed at 0 earlier)
                        // would be merged in and wipe the real warehouse value to 0.
                        const markup = mapped.price > 100000 ? 0 : 2000;
                        mapped.estimatedWarehousePrice = Math.max(0, mapped.price - markup);
                        mapped.hasDiscount = mapped.originalPrice > mapped.price;
                    }

                    // Preserve a self-hosted image instead of reverting to the Costco
                    // hotlink; remember the latest upstream URL as sourceImage so the
                    // image backfill can detect real upstream changes.
                    if (/storage\.googleapis\.com|firebasestorage\.googleapis\.com/.test(existing.image || '')) {
                        mapped.sourceImage = mapped.image;
                        mapped.image = existing.image;
                    }
                    // Existing products: don't touch status (admin's decision).
                }

                batch.set(docRef, mapped, { merge: true });
                batchCount++;
            }

            if (batchCount > 0) {
                await batch.commit();
                totalSaved += batchCount;
            }

            processed += batchIds.length;
            steps[i].processed = processed;
            steps[i].percentage = idArray.length > 0 ? Math.round((processed / idArray.length) * 100) : 0;
            await saveStatus();
            await sleep(100);
        }

        // 3) Cleanup: drop this tag from products that are no longer in the category
        //    (e.g. a sale that ended). Batched ≤400 to stay under Firestore's 500 cap.
        log.push(`Cleaning up expired ${target.tagName} items...`);
        const cleanupSnap = await db.collection('products')
            .where('additionalCategories', 'array-contains', target.tagName)
            .get();

        let cleanupBatch = db.batch();
        let cleanupCount = 0;
        let pending = 0;

        for (const doc of cleanupSnap.docs) {
            if (ids.has(doc.id)) continue; // still in the category — keep
            const p = doc.data();
            let newCategories = (p.additionalCategories || []).filter((c) => c !== target.tagName);
            const updates = { updatedAt: serverTimestamp() };

            if (target.tagName === 'Sale') {
                newCategories = newCategories.filter((c) => c !== 'Хямдралтай');
                updates.hasDiscount = false;
                updates.discountPercent = 0;
                updates.discount = 0;
                // Revert to the non-discounted price.
                if (p.originalPrice && p.originalPrice > (p.price || 0)) {
                    updates.price = p.originalPrice;
                    // Recalculate warehouse price without discount
                    const markup = typeof p.estimatedMarkupKrw === 'number' ? p.estimatedMarkupKrw : (p.originalPrice > 100000 ? 0 : 2000);
                    updates.estimatedWarehousePrice = Math.max(0, p.originalPrice - markup);
                }
            } else if (target.tagName === 'Featured') {
                newCategories = newCategories.filter((c) => c !== 'Trend' && c !== 'BuyersPick');
            }

            updates.additionalCategories = newCategories;
            cleanupBatch.update(doc.ref, updates);
            cleanupCount++;
            pending++;

            if (pending >= 400) {
                await cleanupBatch.commit();
                log.push(`Committed partial cleanup batch (${pending})...`);
                pending = 0;
                cleanupBatch = db.batch();
            }
        }
        if (pending > 0) await cleanupBatch.commit();

        log.push(cleanupCount > 0
            ? `Removed '${target.tagName}' tag from ${cleanupCount} expired items.`
            : `No expired '${target.tagName}' items found.`);

        steps[i].processed = idArray.length;
        steps[i].percentage = 100;
        steps[i].status = 'completed';
        await saveStatus();
    }

    await saveStatus(true);
    return { success: true, saved: totalSaved, failed: totalFailed, logs: log };
};

// ---------------------------------------------------------------------------
// Public: special-category convenience wrapper
// ---------------------------------------------------------------------------

exports.syncSpecialCategories = async (adminInstance = null) => {
    const targets = [
        { code: 'SpecialPriceOffers', name: 'SpecialPriceOffers', label: 'Хямдралтай (Sale)', type: 'allCategories', tagName: 'Sale' },
        { code: 'BuyersPick', name: 'BuyersPick', label: 'Онцлох (Featured)', type: 'allCategories', tagName: 'Featured' },
        { code: 'whatsnew', name: 'New', label: 'Шинэ (New)', type: 'allCategories', tagName: 'New' },
        { code: 'ks_all', name: 'Kirkland Signature', label: 'Kirkland Signature', type: 'category', tagName: 'Kirkland Signature' },
    ];
    return exports.syncWithTargets(targets, adminInstance);
};

// ---------------------------------------------------------------------------
// Public: re-fetch prices for items that have none ("Бэлэн бус")
// ---------------------------------------------------------------------------

/**
 * Re-scrape prices for zero-/missing-price products and write them back.
 *
 * Two ways to choose what to fix:
 *   • targetIds (array)  — caller supplies ids. Used by scripts/rescrape-zero-price.cjs
 *     for items whose `price` field is ABSENT (not 0) — Firestore can't query a missing
 *     field, so the caller pulls ids from the search index instead.
 *   • otherwise          — query products with an explicit price == 0 (skip deleted),
 *     capped at 50 (used by the scheduled dailyPriceFix).
 */
exports.fixZeroPriceProducts = async (adminInstance = null, targetIds = null) => {
    const effectiveAdmin = adminInstance || admin;
    const db = effectiveAdmin.firestore();
    const serverTimestamp = () => effectiveAdmin.firestore.FieldValue.serverTimestamp();
    const log = [];
    log.push('Starting zero-price fix...');

    const { cookie, userAgent } = await getScraperAuth(db);

    try {
        // Decide which ids to re-scrape.
        let ids;
        if (Array.isArray(targetIds) && targetIds.length > 0) {
            ids = targetIds.filter(Boolean);
        } else {
            const snap = await db.collection('products')
                .where('price', '==', 0)
                .limit(50)
                .get();
            ids = [];
            snap.forEach((doc) => {
                if ((doc.data() || {}).status !== 'deleted') ids.push(doc.id);
            });
        }

        if (ids.length === 0) {
            log.push('No zero-price products to fix.');
            return { success: true, updated: 0, logs: log };
        }
        log.push(`Fixing ${ids.length} products.`);

        // Re-fetch and write only price-related fields (minimise overwrites).
        const details = await fetchProductsBatch(ids, cookie, userAgent, 5);
        const batch = db.batch();
        let updated = 0;

        for (const detail of details) {
            if (detail && detail.code && detail.price && detail.price.value > 0) {
                const base = detail.basePrice ? detail.basePrice.value : detail.price.value;
                batch.update(db.collection('products').doc(detail.code), {
                    price: detail.price.value,
                    originalPrice: base,
                    hasDiscount: base > detail.price.value,
                    lastScraped: new Date().toISOString(),
                    lastFixed: serverTimestamp(),
                });
                updated++;
                log.push(`Fixed ${detail.code}: ${detail.price.value} Won`);
            } else {
                log.push(`No valid price for ${detail ? detail.code : 'unknown'}`);
            }
        }

        if (updated > 0) await batch.commit();
        log.push(`Successfully updated ${updated} products.`);
        return { success: true, updated, logs: log };
    } catch (error) {
        console.error('Zero price fix failed:', error);
        log.push(`Error: ${error.message}`);
        return { success: false, error: error.message, logs: log };
    }
};
