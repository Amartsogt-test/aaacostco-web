const admin = require("firebase-admin");

// 1. FIREBASE AUTH CONFIG
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentUpdated, onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");

// Initialize Firebase Admin
// If running in Cloud Functions, use applicationDefault()
// If running locally with service-account, use cert()
if (process.env.FUNCTIONS_EMULATOR || process.env.NODE_ENV === 'development') {
    try {
        const serviceAccount = require("./service-account.json");
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } catch (e) {
        console.warn("Service account not found or invalid, initializing default.");
        admin.initializeApp();
    }
} else {
    admin.initializeApp();
}

const db = admin.firestore();

// Special collections that need price syncing
const SPECIAL_COLLECTIONS = [
    'products_featured',
    'products_sale',
    'products_kirkland',
    'products_new'
];

/**
 * Auto-sync prices from products to special collections
 * Triggers when a product is updated
 */
exports.syncProductPrices = onDocumentUpdated({
    document: 'products/{productId}',
    region: 'us-central1'
}, async (event) => {
    const productId = event.params.productId;
    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();

    // Only sync if price-related fields changed
    if (beforeData.price === afterData.price &&
        beforeData.originalPrice === afterData.originalPrice &&
        beforeData.discountPercent === afterData.discountPercent) {
        return null;
    }

    console.log(`Price updated for ${productId}: ${beforeData.price} -> ${afterData.price}`);

    // Update in all special collections
    const batch = db.batch();
    let updateCount = 0;

    for (const collName of SPECIAL_COLLECTIONS) {
        const docRef = db.collection(collName).doc(productId);
        const doc = await docRef.get();

        if (doc.exists) {
            batch.update(docRef, {
                price: afterData.price,
                originalPrice: afterData.originalPrice,
                discountPercent: afterData.discountPercent || 0,
                hasDiscount: afterData.hasDiscount || false
            });
            updateCount++;
        }
    }

    if (updateCount > 0) {
        await batch.commit();
        console.log(`Synced ${productId} to ${updateCount} special collections`);
    }

    return { synced: updateCount };
});

/**
 * When a new product is created, also add to special collections if needed
 * This syncs the price from the start
 */
exports.onProductCreated = onDocumentCreated({
    document: 'products/{productId}',
    region: 'us-central1'
}, async (event) => {
    const productId = event.params.productId;
    const data = event.data.data();

    // Log new product
    console.log(`New product created: ${productId} - ${data.name} - ${data.price}₩`);

    return null;
});

// Secure Admin Bypass Function
exports.verifyAdminBypass = onCall(async (request) => {
    const { phone, code } = request.data;

    // Hardcoded secure credentials
    const ADMIN_PHONE = '23568947';
    const ADMIN_CODE = '429496';

    // Verify
    if (phone === ADMIN_PHONE && code === ADMIN_CODE) {
        try {
            // Create custom token
            const uid = 'admin-bypass-' + ADMIN_PHONE;
            const additionalClaims = { isAdmin: true };

            const customToken = await admin.auth().createCustomToken(uid, additionalClaims);

            return { token: customToken };
        } catch (error) {
            console.error("Error creating custom token:", error);
            throw new HttpsError('internal', 'Unable to create token');
        }
    } else {
        // Return Error
        throw new HttpsError('invalid-argument', 'Invalid credentials');
    }
});

// Scraper Function
const scraper = require('./scraper');

exports.syncProducts = onCall({
    timeoutSeconds: 540,
    memory: "1GiB",
    region: "us-central1" // Optional, default usually fine
}, async (request) => {
    // Optional: Verify Admin
    // const isAdmin = request.auth && request.auth.token.isAdmin;
    // if (!isAdmin) throw new HttpsError('permission-denied', 'Admin only');

    try {
        const result = await scraper.syncSpecialCategories();
        return result;
    } catch (error) {
        console.error("Sync Error:", error);
        throw new HttpsError('internal', error.message);
    }
});

/**
 * Scheduled Daily Fix for Zero Price Products
 * Runs every day at 09:00 (Asia/Ulaanbaatar)
 */
exports.dailyPriceFix = onSchedule({
    schedule: "every day 09:00",
    timeZone: "Asia/Ulaanbaatar",
    retryCount: 3,
    memory: "1GiB",
    timeoutSeconds: 300
}, async (event) => {
    console.log("Starting daily zero-price fix...");
    try {
        const result = await scraper.fixZeroPriceProducts();
        console.log("Daily fix result:", result);
    } catch (error) {
        console.error("Daily fix failed:", error);
    }
});

/**
 * 🔍 SEARCH INDEX: Rebuild the search index document (chunked for large datasets)
 * This creates a lightweight index for instant client-side search
 */
const ITEMS_PER_CHUNK = 500;

async function buildChunkedSearchIndex() {
    const productsSnapshot = await db.collection('products')
        .where('status', '!=', 'deleted')
        .get();

    const indexItems = [];

    productsSnapshot.forEach(doc => {
        const data = doc.data();
        // Minimal fields with shortened keys
        indexItems.push({
            id: doc.id,
            n: data.name || '',
            m: data.name_mn || '',
            e: data.englishName || '',
            b: data.brand || '',
            c: data.code || '',
            i: data.image || '',
            p: data.price?.value || data.price || 0,
            o: data.originalPrice?.value || data.originalPrice || 0,
            d: data.hasDiscount || false,
            s: data.status || 'active',
            cat: data.categoryCode || '',
            ac: data.additionalCategories || []
        });
    });

    // Split into chunks
    const chunks = [];
    for (let i = 0; i < indexItems.length; i += ITEMS_PER_CHUNK) {
        chunks.push(indexItems.slice(i, i + ITEMS_PER_CHUNK));
    }

    // Write each chunk as a separate document
    const batch = db.batch();

    for (let i = 0; i < chunks.length; i++) {
        const chunkRef = db.collection('system').doc(`search_index_${i}`);
        batch.set(chunkRef, {
            items: chunks[i],
            chunkIndex: i,
            count: chunks[i].length,
            totalChunks: chunks.length,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }

    // Write metadata document
    const metaRef = db.collection('system').doc('search_index_meta');
    batch.set(metaRef, {
        totalItems: indexItems.length,
        totalChunks: chunks.length,
        itemsPerChunk: ITEMS_PER_CHUNK,
        version: Date.now(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();

    return { totalItems: indexItems.length, totalChunks: chunks.length };
}

exports.rebuildSearchIndex = onCall({
    timeoutSeconds: 300,
    memory: "512MiB",
    region: "us-central1"
}, async (request) => {
    console.log("🔍 Rebuilding search index...");

    try {
        const result = await buildChunkedSearchIndex();
        console.log(`✅ Search index rebuilt: ${result.totalItems} items in ${result.totalChunks} chunks`);
        return { success: true, ...result };
    } catch (error) {
        console.error("❌ Search index rebuild failed:", error);
        throw new HttpsError('internal', error.message);
    }
});

/**
 * 🔍 SEARCH INDEX: Scheduled rebuild every 6 hours
 * Keeps the search index fresh with minimal overhead
 */
exports.scheduledSearchIndexRebuild = onSchedule({
    schedule: "every 6 hours",
    timeZone: "Asia/Ulaanbaatar",
    retryCount: 2,
    memory: "512MiB",
    timeoutSeconds: 300
}, async (event) => {
    console.log("🔍 Scheduled search index rebuild starting...");

    try {
        const result = await buildChunkedSearchIndex();
        console.log(`✅ Scheduled search index update: ${result.totalItems} items in ${result.totalChunks} chunks`);
    } catch (error) {
        console.error("❌ Scheduled search index rebuild failed:", error);
    }
});
