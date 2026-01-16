
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
    product.updatedAt = (adminInstance || admin).firestore.FieldValue.serverTimestamp();
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
exports.syncSpecialCategories = async (adminInstance = null) => {
    const db = (adminInstance || admin).firestore();
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
                    lastUpdated: (adminInstance || admin).firestore.FieldValue.serverTimestamp()
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

        // 🚀 3. CLEANUP: Remove tag from products no longer in the list
        // This fixes the issue where expired sales remain in the category
        log.push(`Cleaning up expired ${target.tagName} items...`);
        // Note: ids is the Set of ALL codes currently on the site for this category

        const cleanupSnapshot = await db.collection('products')
            .where('additionalCategories', 'array-contains', target.tagName)
            .get();

        let cleanupBatch = db.batch();
        let cleanupCount = 0;
        let batchSize = 0;

        for (const doc of cleanupSnapshot.docs) {
            if (!ids.has(doc.id)) {
                // Product is in DB as 'Sale' (or other tag) but NOT in current scrape list -> Expired
                const p = doc.data();
                let newCategories = (p.additionalCategories || []).filter(c => c !== target.tagName);

                const updates = {
                    updatedAt: (adminInstance || admin).firestore.FieldValue.serverTimestamp()
                };

                // Specific Tag Cleanup
                if (target.tagName === 'Sale') {
                    // Also remove 'Хямдралтай'
                    newCategories = newCategories.filter(c => c !== 'Хямдралтай');
                    // Reset discount flag since it's no longer in SpecialPriceOffers
                    updates.hasDiscount = false;
                } else if (target.tagName === 'Featured') {
                    // Remove related tags
                    newCategories = newCategories.filter(c => c !== 'Trend' && c !== 'BuyersPick');
                }

                updates.additionalCategories = newCategories;

                cleanupBatch.update(doc.ref, updates);
                cleanupCount++;
                batchSize++;

                // Firestore batch limit is 500.
                if (batchSize >= 400) {
                    await cleanupBatch.commit();
                    log.push(`Committed partial cleanup batch (${batchSize})...`);
                    batchSize = 0;
                    cleanupBatch = db.batch(); // Re-instantiate
                }
            }
        }

        // Commit remaining
        if (batchSize > 0) {
            await cleanupBatch.commit();
        }

        if (cleanupCount > 0) {
            log.push(`Removed '${target.tagName}' tag from ${cleanupCount} expired items.`);
        } else {
            log.push(`No expired '${target.tagName}' items found.`);
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

exports.fixZeroPriceProducts = async () => {
    const db = admin.firestore();
    const log = [];
    let updatedCount = 0;

    log.push("Starting zero-price fix...");

    // 🍪 FETCH COOKIE SETTINGS
    let cookie = '';
    let userAgent = '';
    try {
        const settingsSnap = await db.collection('settings').doc('scraper').get();
        if (settingsSnap.exists) {
            const data = settingsSnap.data();
            cookie = data.cookie || '';
            userAgent = data.userAgent || '';
        }
    } catch (e) {
        console.error("Failed to fetch scraper settings:", e);
        return { success: false, error: "Settings fetch failed" };
    }

    // 1. Find Zero Price Products (Limit 50 to avoid timeouts)
    try {
        const snapshot = await db.collection('products')
            .where('price', '==', 0)
            .where('status', '==', 'active') // Only fix active products
            .limit(50)
            .get();

        if (snapshot.empty) {
            log.push("No zero-price active products found.");
            console.log("No zero-price active products found.");
            return { success: true, updated: 0, logs: log };
        }

        const productsToFix = [];
        snapshot.forEach(doc => {
            productsToFix.push({ id: doc.id, ...doc.data() });
        });

        log.push(`Found ${productsToFix.length} products with 0 price.`);

        // 2. Fetch fresh details
        const ids = productsToFix.map(p => p.id);

        // Reuse existing batch fetch logic if possible, or simple loop
        // We'll use the existing fetchProductsBatch helper
        // We need to make sure fetchProductsBatch is accessible or copy the logic. 
        // It is defined in this file (scraper.js) but not exported. We can call it directly.

        const freshDetails = await fetchProductsBatch(ids, cookie, userAgent, 5);

        // 3. Update Database
        const batch = db.batch();
        let batchCount = 0;

        for (const detail of freshDetails) {
            if (detail && detail.code && detail.price && detail.price.value > 0) {
                const docRef = db.collection('products').doc(detail.code);

                // Only update price-related fields to minimize overwrites
                const updates = {
                    price: detail.price.value,
                    originalPrice: detail.basePrice ? detail.basePrice.value : detail.price.value,
                    // Recalculate discount
                    hasDiscount: (detail.basePrice ? detail.basePrice.value : detail.price.value) > detail.price.value,
                    lastScraped: new Date().toISOString(),
                    lastFixed: (adminInstance || admin).firestore.FieldValue.serverTimestamp()
                };

                batch.update(docRef, updates);
                batchCount++;
                log.push(`Fixed ${detail.code}: ${updates.price} Won`);
            } else {
                log.push(`Failed to fetch valid price for ${detail ? detail.code : 'unknown'}`);
            }
        }

        if (batchCount > 0) {
            await batch.commit();
            updatedCount = batchCount;
        }

        log.push(`Successfully updated ${updatedCount} products.`);

    } catch (error) {
        console.error("Zero price fix failed:", error);
        log.push(`Error: ${error.message}`);
        return { success: false, error: error.message, logs: log };
    }

    return { success: true, updated: updatedCount, logs: log };
};
