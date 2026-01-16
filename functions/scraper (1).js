
const admin = require('firebase-admin');
const { HttpsError } = require("firebase-functions/v2/https");

// Helper Utils
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchJson(url, cookie = '', userAgent = '', retries = 3) {
    try {
        const headers = {
            'User-Agent': userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        };
        if (cookie) {
            headers['Cookie'] = cookie;
        }

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

function fixImageUrl(url) {
    if (!url) return '';
    return url.startsWith('http') ? url : `https://www.costco.co.kr${url}`;
}

function extractSpecifications(classifications) {
    if (!classifications || !Array.isArray(classifications)) return [];
    const specs = [];
    for (const classification of classifications) {
        if (classification.features) {
            for (const feature of classification.features) {
                if (feature.name && feature.featureValues && feature.featureValues[0]) {
                    specs.push({
                        name: feature.name,
                        value: feature.featureValues[0].value || ''
                    });
                }
            }
        }
    }
    return specs;
}

const CATEGORY_MAP = {
    'SpecialPriceOffers': 'Sale',
    'BuyersPick': 'Featured',
    'whatsnew': 'New',
    'ks_all': 'Kirkland Signature'
};

const SUBCATEGORY_MAP = {
    'SpecialPriceOffers': 'Special Offers',
    'BuyersPick': 'Buyers Pick',
    'ks_all': 'Everything',
    'whatsnew': 'New Arrivals'
};

const CATEGORY_NAMES = {
    'Sale': 'Хямдралтай',
    'Featured': 'Онцлох',
    'Kirkland Signature': 'Kirkland Signature',
    'New': 'Шинэ'
};

function mapAllFields(raw, catCode) {
    const product = { ...raw };
    product.id = raw.code;
    // NOTE: Do NOT set product.status here
    // This preserves admin's decision to mark products as inactive
    // New products will get 'active' status set in the save logic

    const priceValue = (raw.price && typeof raw.price === 'object') ? raw.price.value : 0;
    const basePriceValue = (raw.basePrice && typeof raw.basePrice === 'object') ? raw.basePrice.value : priceValue;
    product.price = priceValue;
    product.originalPrice = basePriceValue;
    product.hasDiscount = product.originalPrice > product.price;

    if (raw.images && Array.isArray(raw.images)) {
        product.images = raw.images.map(img => ({ ...img, url: fixImageUrl(img.url) }));
        const mainImg = raw.images.find(i => i.format === 'product') || raw.images[0];
        product.image = mainImg ? fixImageUrl(mainImg.url) : '';
    }

    product.category = CATEGORY_MAP[catCode] || 'General';
    product.subCategory = SUBCATEGORY_MAP[catCode] || 'General';
    product.categoryName = CATEGORY_NAMES[product.category] || product.category;
    product.subCategoryName = product.subCategory;
    product.targetCode = catCode;

    product.additionalCategories = [
        product.category,
        product.subCategory,
        product.categoryName,
        raw.wcs_ag_id
    ].filter(Boolean);

    if (catCode === 'SpecialPriceOffers') {
        product.hasDiscount = true;
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

    // Only add 'Sale' tag to products that come from SpecialPriceOffers category
    // NOT all products with hasDiscount (which would inflate counts)
    if (catCode === 'SpecialPriceOffers') {
        if (!product.additionalCategories.includes('Sale')) product.additionalCategories.push('Sale');
        if (!product.additionalCategories.includes('Хямдралтай')) product.additionalCategories.push('Хямдралтай');
    }

    product.specifications = extractSpecifications(raw.classifications);
    product.brand = raw.manufacturer || 'Costco';
    product.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    product.lastScraped = new Date().toISOString();
    product.source = 'cloud_function_scraper';

    return product;
}

async function fetchProductDetails(productCode, cookie, userAgent) {
    const url = `https://www.costco.co.kr/rest/v2/korea/products/${productCode}?fields=FULL`;
    return await fetchJson(url, cookie, userAgent);
}

// 🚀 OPTIMIZED: Parallel fetch with concurrency limit
async function fetchProductsBatch(ids, cookie, userAgent, concurrency = 10) {
    const results = [];
    for (let i = 0; i < ids.length; i += concurrency) {
        const batch = ids.slice(i, i + concurrency);
        const promises = batch.map(id => fetchProductDetails(id, cookie, userAgent).catch(() => null));
        const batchResults = await Promise.all(promises);
        results.push(...batchResults.filter(r => r && r.code));
        await sleep(100); // Small delay between batches
    }
    return results;
}

// Main logic
exports.syncSpecialCategories = async () => {
    const db = admin.firestore();
    const statusRef = db.collection('system').doc('syncStatus');

    // 🍪 FETCH COOKIE SETTINGS
    let cookie = '';
    let userAgent = '';
    try {
        const settingsSnap = await db.collection('settings').doc('scraper').get();
        if (settingsSnap.exists) {
            const data = settingsSnap.data();
            cookie = data.cookie || '';
            userAgent = data.userAgent || '';
            console.log('Got cookie/UA from settings. Cookie len:', cookie.length, 'UA:', userAgent);
        } else {
            console.log('No scraper settings found.');
        }
    } catch (e) {
        console.error("Failed to fetch scraper settings:", e);
    }

    const targets = [
        { code: 'SpecialPriceOffers', name: 'SpecialPriceOffers', label: 'Хямдралтай (Sale)', type: 'allCategories', tagName: 'Sale' },
        { code: 'BuyersPick', name: 'BuyersPick', label: 'Онцлох (Featured)', type: 'allCategories', tagName: 'Featured' },
        { code: 'whatsnew', name: 'New', label: 'Шинэ (New)', type: 'allCategories', tagName: 'New' },
        { code: 'ks_all', name: 'Kirkland Signature', label: 'Kirkland Signature', type: 'category', tagName: 'Kirkland Signature' }
    ];

    const steps = targets.map(t => ({
        label: t.label,
        status: 'pending',
        processed: 0,
        total: 0,
        percentage: 0,
        dbCount: 0
    }));

    let lastUpdate = 0;
    const saveStatus = async (isGlobalComplete = false) => {
        const now = Date.now();
        if (isGlobalComplete || now - lastUpdate > 2000) { // Reduced update frequency
            try {
                await statusRef.set({
                    state: isGlobalComplete ? 'completed' : 'running',
                    steps: steps,
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                });
                lastUpdate = now;
            } catch (e) {
                console.error("Progress update failed:", e);
            }
        }
    };

    let totalSaved = 0;
    let totalFailed = 0;
    const log = [];

    await saveStatus();

    for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        log.push(`Scanning ${target.code}...`);

        // Count existing in DB
        try {
            const snapshot = await db.collection('products')
                .where('additionalCategories', 'array-contains', target.tagName)
                .count()
                .get();
            steps[i].dbCount = snapshot.data().count;
        } catch (e) {
            steps[i].dbCount = 0;
        }

        steps[i].status = 'running';
        await saveStatus();

        // 1. Get IDs (unchanged)
        let page = 0;
        let totalPages = 1;
        const ids = new Set();

        while (page < totalPages && page < 20) {
            const queryType = target.type === 'allCategories' ? 'allCategories' : 'category';
            const query = `:relevance:${queryType}:${target.code}`;
            const url = `https://www.costco.co.kr/rest/v2/korea/products/search?fields=products(code),pagination&query=${encodeURIComponent(query)}&pageSize=100&currentPage=${page}`;

            const data = await fetchJson(url, cookie, userAgent); // Pass cookie & UA
            if (!data || !data.products) break;

            if (data.pagination) totalPages = data.pagination.totalPages;
            data.products.forEach(p => ids.add(p.code));
            page++;
            await sleep(50);
        }

        const idArray = Array.from(ids);
        steps[i].total = idArray.length;
        log.push(`Found ${idArray.length} items for ${target.code}. Fetching...`);
        await saveStatus();

        // 🚀 2. OPTIMIZED: Parallel fetch with batching
        const BATCH_SIZE = 15; // Process 15 items in parallel
        let processedForTarget = 0;

        for (let batchStart = 0; batchStart < idArray.length; batchStart += BATCH_SIZE) {
            const batchIds = idArray.slice(batchStart, batchStart + BATCH_SIZE);

            // Parallel fetch
            const fetchPromises = batchIds.map(id => fetchProductDetails(id, cookie, userAgent).catch(() => null)); // Pass cookie & UA
            const details = await Promise.all(fetchPromises);

            // 🚀 Batch write to Firestore
            const batch = db.batch();
            let batchCount = 0;

            for (const detail of details) {
                if (detail && detail.code) {
                    const product = mapAllFields(detail, target.code);
                    const docRef = db.collection('products').doc(product.id);

                    // Check if product exists - only set status for new products
                    const existingDoc = await docRef.get();
                    if (!existingDoc.exists) {
                        // New product - set status to active
                        product.status = 'active';
                    } else {
                        // Existing product
                        const existingData = existingDoc.data();

                        // PRESERVE PRICE: If scraped price is 0 but we have a valid price in DB, keep it
                        if (product.price === 0 && existingData.price > 0) {
                            product.price = existingData.price;
                            // Also try to preserve originalPrice if it seems related
                            if (product.originalPrice === 0 && existingData.originalPrice > 0) {
                                product.originalPrice = existingData.originalPrice;
                            }
                        }
                    }
                    // Existing product - don't include status in update to preserve admin's decision

                    batch.set(docRef, product, { merge: true });
                    batchCount++;
                } else {
                    totalFailed++;
                }
            }

            if (batchCount > 0) {
                await batch.commit();
                totalSaved += batchCount;
            }

            processedForTarget += batchIds.length;
            steps[i].processed = processedForTarget;
            steps[i].percentage = idArray.length > 0 ? Math.round((processedForTarget / idArray.length) * 100) : 0;
            await saveStatus();

            await sleep(100); // Small delay between batches
        }

        steps[i].processed = idArray.length;
        steps[i].percentage = 100;
        steps[i].status = 'completed';
        await saveStatus();
    }

    await saveStatus(true);

    return {
        success: true,
        saved: totalSaved,
        failed: totalFailed,
        logs: log
    };
};
