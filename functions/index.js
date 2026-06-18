const admin = require("firebase-admin");

// 1. FIREBASE AUTH CONFIG
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentUpdated, onDocumentCreated, onDocumentWritten } = require("firebase-functions/v2/firestore");
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

// Firestore database id. Defaults to "(default)". To move data to an Asia region,
// create a named Firestore database (e.g. asia-northeast3) and set the
// FIRESTORE_DATABASE_ID env var on the functions — db reads/writes and the
// document triggers below then target that database with no other code change.
// NOTE: at cutover, the trigger `region` should match the new database's region.
const { getFirestore } = require("firebase-admin/firestore");
const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || '(default)';
const db = FIRESTORE_DATABASE_ID === '(default)'
    ? admin.firestore()
    : getFirestore(admin.app(), FIRESTORE_DATABASE_ID);

// Queue a transactional email via the Firestore "Trigger Email" extension (writes
// to the `mail` collection). No-op if `to` is empty or the extension isn't set up.
async function queueMail(to, subject, text, html) {
    if (!to) return;
    try {
        await db.collection("mail").add({ to, message: { subject, text, ...(html ? { html } : {}) } });
    } catch (e) { console.warn("queueMail failed:", e && e.message); }
}

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
    database: FIRESTORE_DATABASE_ID,
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
    database: FIRESTORE_DATABASE_ID,
    region: 'us-central1'
}, async (event) => {
    const productId = event.params.productId;
    const data = event.data.data();

    // Log new product
    console.log(`New product created: ${productId} - ${data.name} - ${data.price}₩`);

    return null;
});

// ============================================================
// 🔐 ADMIN LOGIN: Server-side credential verification
// Reads admin phone/PIN from Firestore settings/admin_auth
// ============================================================
const crypto = require("crypto");

/**
 * Hash a PIN with a secret salt (server-side only)
 */
function hashPin(pin, secret) {
    return crypto.createHash("sha256").update(pin + secret).digest("hex");
}

// NOTE: The phone+PIN `verifyAdminLogin` callable was removed — admin access is
// now granted via Facebook login (see handleFacebookLogin in src/pages/Login.jsx),
// so the PIN-bypass endpoint is no longer needed and was deleted to reduce the
// authentication attack surface. Delete the deployed copy with:
//   firebase functions:delete verifyAdminLogin --region us-central1

/**
 * Utility: Setup admin auth credentials in Firestore
 * Call once to initialize: setupAdminAuth({ phone: "XXXXXXXX", pin: "YYYY" })
 * This should be called from Firebase shell or Admin SDK only
 */
exports.setupAdminAuth = onCall({
    region: "asia-northeast3"
}, async (request) => {
    // Only allow if caller is already admin or no admin_auth exists yet
    const existingDoc = await db.collection("settings").doc("admin_auth").get();
    if (existingDoc.exists) {
        // Verify caller is admin
        if (!request.auth || !request.auth.token?.isAdmin) {
            throw new HttpsError("permission-denied", "Only admins can update admin credentials");
        }
    }

    const { phone, pin } = request.data;
    if (!phone || !pin) {
        throw new HttpsError("invalid-argument", "Phone and PIN are required");
    }

    const secret = crypto.randomBytes(32).toString("hex");
    const pinHash = hashPin(pin, secret);

    await db.collection("settings").doc("admin_auth").set({
        phone: phone.replace(/\D/g, ""),
        pinHash,
        secret,
        updatedAt: new Date().toISOString()
    });

    return { success: true, message: "Admin credentials saved securely" };
});

// Scraper Function
const scraper = require('./scraper');

exports.syncProducts = onCall({
    timeoutSeconds: 540,
    memory: "1GiB",
    region: "asia-northeast3" // Optional, default usually fine
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
 * 🏆 MEMBERSHIP TIERS (scheduled safety-net): recompute every user's lifetime spend (₩)
 * and tier from their orders, once a day. notifyOrderStage already keeps an active buyer's
 * tier current in real time; this batch pass additionally backfills users who existed
 * before the feature and self-heals any drift — so nobody ever has to run a manual script.
 * Same rule as notifyOrderStage: an order counts while confirmed-or-beyond (not cancelled),
 * using the server-authoritative pre-discount value, with a legacy 'Хүргэгдсэн' fallback.
 */
const TIER_QUALIFYING = ["confirmed", "purchased", "warehouse", "shipped", "customs", "arrived_ub", "out_for_delivery", "delivered"];

function orderSpendKRW(o) {
    const serverKRW = Number(o.priceAudit && o.priceAudit.serverSubtotalKRW) || 0;
    if (serverKRW > 0) return serverKRW;
    if (!Array.isArray(o.items)) return 0;
    return o.items.reduce((acc, item) => {
        const p = Number((item && item.price && item.price.value) != null ? item.price.value : (item && item.price)) || 0;
        return acc + p * (Number(item && item.quantity) || 0);
    }, 0);
}

exports.dailyTierSync = onSchedule({
    schedule: "every day 09:30",
    timeZone: "Asia/Ulaanbaatar",
    retryCount: 3,
    memory: "512MiB",
    timeoutSeconds: 300
}, async () => {
    console.log("Starting daily membership-tier sync...");
    try {
        // 1. Bucket spend by user from a single orders read.
        const spendByUser = new Map();
        const ordersSnap = await db.collection("orders").get();
        ordersSnap.forEach((d) => {
            const o = d.data() || {};
            if (!o.userId || String(o.userId).startsWith("guest-")) return;
            const counts = TIER_QUALIFYING.includes(o.trackingStage) || (!o.trackingStage && o.status === "Хүргэгдсэн");
            if (!counts) return;
            spendByUser.set(o.userId, (spendByUser.get(o.userId) || 0) + orderSpendKRW(o));
        });

        // 2. Update each user whose tier/spend changed (batched, ≤500 per commit).
        const usersSnap = await db.collection("users").get();
        let batch = db.batch();
        let pending = 0, updated = 0;
        for (const userDoc of usersSnap.docs) {
            const cur = userDoc.data() || {};
            const totalKRW = Math.round(spendByUser.get(userDoc.id) || 0);
            let tier = "Silver";
            if (totalKRW >= 20000000) tier = "Platinum";
            else if (totalKRW >= 10000000) tier = "Gold";
            if (Number(cur.totalSpendKRW || 0) === totalKRW && cur.tier === tier) continue;
            batch.update(userDoc.ref, { totalSpendKRW: totalKRW, tier });
            updated++; pending++;
            if (pending >= 450) { await batch.commit(); batch = db.batch(); pending = 0; }
        }
        if (pending > 0) await batch.commit();
        console.log(`Tier sync done: scanned ${ordersSnap.size} orders, updated ${updated}/${usersSnap.size} users.`);
    } catch (error) {
        console.error("Daily tier sync failed:", error);
    }
});

/**
 * ⏳ LOYALTY BONUS EXPIRY (scheduled): each launch-bonus lot expires 1 month after it was
 * credited (loyaltyLots[].expiresAt). This daily job drops expired lots and recomputes the
 * aggregate loyaltyPointsKRW = sum of the remaining lots. "Use it within a month or lose it."
 * Redemption (createOrder) also purges expired lots opportunistically; this guarantees the
 * displayed balance stays correct even for users who don't check out.
 */
exports.expireLoyaltyBonus = onSchedule({
    schedule: "every day 03:00",
    timeZone: "Asia/Ulaanbaatar",
    retryCount: 3,
    memory: "512MiB",
    timeoutSeconds: 300
}, async () => {
    console.log("Starting loyalty-bonus expiry sweep...");
    try {
        const nowMs = Date.now();
        const snap = await db.collection("users").get();
        // Collect the writes first (forEach can't await), then commit in ≤450 chunks.
        const writes = [];
        let expiredKRW = 0;
        snap.forEach((d) => {
            const data = d.data() || {};
            const lots = Array.isArray(data.loyaltyLots) ? data.loyaltyLots : [];
            if (lots.length === 0) return;
            const keep = lots.filter((l) => l && new Date(l.expiresAt).getTime() > nowMs);
            if (keep.length === lots.length) return; // nothing expired
            const newBalance = keep.reduce((s, l) => s + (Number(l.krw) || 0), 0);
            const oldBalance = lots.reduce((s, l) => s + (Number(l.krw) || 0), 0);
            expiredKRW += (oldBalance - newBalance);
            writes.push({ ref: d.ref, loyaltyLots: keep, loyaltyPointsKRW: newBalance });
        });
        for (let i = 0; i < writes.length; i += 450) {
            const batch = db.batch();
            for (const w of writes.slice(i, i + 450)) {
                batch.update(w.ref, { loyaltyLots: w.loyaltyLots, loyaltyPointsKRW: w.loyaltyPointsKRW });
            }
            await batch.commit();
        }
        console.log(`Loyalty expiry done: ${writes.length} users updated, ₩${Math.round(expiredKRW)} expired.`);
    } catch (error) {
        console.error("Loyalty expiry failed:", error);
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
    region: "asia-northeast3"
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

// ============================================================
// 🤖 AI PROXY: Server-side Gemini API proxy
// Keeps the API key on the server, never exposed to clients
// ============================================================
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Models are env-configurable so we never have to redeploy just to swap them.
// Defaults are current as of 2026; gemini-2.0-flash / gemini-1.5-flash were retired.
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
const GEMINI_FALLBACK = process.env.GEMINI_FALLBACK || "gemini-2.5-flash";

const SAFETY_SETTINGS = [
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
];

/**
 * Get Gemini API key from Firebase Functions config or environment
 */
function getGeminiKey() {
    // Firebase Functions environment variable (set via: firebase functions:secrets:set GEMINI_API_KEY)
    return process.env.GEMINI_API_KEY || "";
}

/**
 * Call Gemini with fallback model support
 */
async function callGemini(prompt, options = {}) {
    const apiKey = getGeminiKey();
    if (!apiKey) throw new HttpsError("failed-precondition", "Gemini API key not configured");

    const { jsonMode = false, temperature } = options;

    const tryModel = async (modelId) => {
        const genAI = new GoogleGenerativeAI(apiKey);
        const genConfig = {};
        if (jsonMode) genConfig.responseMimeType = "application/json";
        if (temperature !== undefined) genConfig.temperature = temperature;

        const model = genAI.getGenerativeModel({
            model: modelId,
            safetySettings: SAFETY_SETTINGS,
            ...(Object.keys(genConfig).length > 0 ? { generationConfig: genConfig } : {})
        });

        const result = await model.generateContent(prompt);
        return result.response.text();
    };

    try {
        return await tryModel(GEMINI_MODEL);
    } catch (err) {
        console.warn(`AI Proxy: ${GEMINI_MODEL} failed, trying fallback...`, err.message);
        return await tryModel(GEMINI_FALLBACK);
    }
}

exports.aiProxy = onCall({
    region: "asia-northeast3",
    timeoutSeconds: 60,
    memory: "256MiB",
    invoker: "public"
}, async (request) => {
    // SECURITY: require an authenticated caller (guests get a lightweight
    // anonymous Firebase session via ensureSignedIn() on the client). Previously
    // this endpoint was fully open, so anyone could drive the project's paid
    // Gemini quota — a denial-of-wallet / free-proxy abuse vector.
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Sign-in required.");
    }

    const { action, payload } = request.data;

    if (!action) {
        throw new HttpsError("invalid-argument", "Action is required");
    }

    switch (action) {
        case "parseIntent": {
            const { message } = payload;
            if (!message) throw new HttpsError("invalid-argument", "Message is required");

            const prompt = `
            You are a helpful AI Personal Shopper for a Costco import store in Mongolia.
            Analyze the user's search query: "${message}"

            Intent analysis requirements:
            1. isSearch: true if they are looking for specific products.
            2. mustHave: Array of the MOST CRITICAL English keywords that MUST be in the product name or category.
            3. synonyms: Array of secondary keywords or synonyms in Mongolian and English.
            4. excludeTerms: Array of keywords to EXCLUDE.
            5. predictedCategory: A likely category name.

            Respond strictly in this JSON structure:
            {
              "isSearch": boolean,
              "mustHave": string[],
              "synonyms": string[],
              "excludeTerms": string[],
              "predictedCategory": string
            }
            `;

            const text = await callGemini(prompt, { jsonMode: true });
            try {
                return JSON.parse(text);
            } catch {
                const jsonStr = text.replace(/```json|```/g, "").trim();
                return JSON.parse(jsonStr);
            }
        }

        case "generateRecommendation": {
            const { userMessage, products } = payload;
            if (!userMessage) throw new HttpsError("invalid-argument", "User message is required");

            const productInfo = (products || [])
                .map(p => `- ${p.name_mn || p.name} (${(p.price || 0).toLocaleString()}₮)`)
                .join("\n");

            const prompt = `
            You are a helpful AI Personal Shopper for "AAA Costco" in Mongolia.
            User asked: "${userMessage}"
            We found these products in our local store:
            ${productInfo}
            
            Write a short, friendly response in Mongolian (Ulaanbaatar dialect) recommending these items.
            Keep it concise (max 3 sentences).
            `;

            const text = await callGemini(prompt);
            return { response: text };
        }

        case "calculateWeight": {
            const { product } = payload;
            if (!product) throw new HttpsError("invalid-argument", "Product data is required");

            const productContext = `
                Name (MN): ${product.name_mn || ''}
                Name (EN): ${product.englishName || product.name || ''}
                Brand: ${product.brand || ''}
                Specs: ${JSON.stringify(product.specifications || product.classifications || [])}
                Description (MN): ${(product.description_mn || '').substring(0, 500)}
                Description (EN): ${(product.description_en || product.description || '').substring(0, 500)}
            `;

            const prompt = `
            You are a logistics expert specializing in Costco products.
            Analyze this product information and calculate the TOTAL SHIPPING WEIGHT in Kilograms (kg).

            PRODUCT INFO:
            ${productContext}

            CRITICAL RULES:
            1. MULTIPLIERS ARE VITAL: If names include "x 40", "x 12", etc., MULTIPLY the unit weight.
            2. PRODUCT TYPE CONVERSION: Liquids (ml, L): 1 liter = 1kg. Grains/Powders: Direct weight.
            3. IGNORE DIMENSIONS: "74cm x 74cm" are NOT weights.
            4. PACKAGE OVERHEAD: Add 5% extra for heavy bulk or glass items.
            5. ESTIMATION: If no explicit weight found, use typical Costco product sizes.
            6. WAREHOUSE PRICE ESTIMATION: Estimate the shipping markup in KRW.

            Return JSON only:
            {
              "weightKg": number,
              "reason": "short explanation in Mongolian",
              "confidence": "high" | "medium" | "low",
              "estimatedMarkupKrw": number
            }
            `;

            const text = await callGemini(prompt, { jsonMode: true, temperature: 0.1 });
            try {
                return JSON.parse(text);
            } catch {
                const jsonStr = text.replace(/```json|```/g, "").trim();
                return JSON.parse(jsonStr);
            }
        }

        case "generateSummary": {
            const { product } = payload;
            if (!product) throw new HttpsError("invalid-argument", "Product data is required");

            // Use persisted short description if available
            if (product.shortDescription && product.shortDescription.length > 5) {
                return { response: product.shortDescription };
            }

            const productContext = `
                Name (MN): ${product.name_mn || product.name || ''}
                Name (EN): ${product.englishName || ''}
                Brand: ${product.brand || ''}
                Price: ${product.price || ''}
                Specs: ${JSON.stringify(product.specifications || product.classifications || [])}
                Description (MN): ${(product.description_mn || '').substring(0, 1000)}
                Description (EN): ${(product.description_en || product.description || '').substring(0, 1000)}
            `;

            const prompt = `
            You are a helpful Costco Personal Shopper.
            Write a SHORT, CONCISE summary of this product in MONGOLIAN (Ulaanbaatar dialect).
            
            PRODUCT INFO:
            ${productContext}

            REQUIREMENTS:
            1. Key Benefits: What is it? Why is it good? (1 sentence).
            2. Usage/Specs: Quantity, size, or how to use (1 sentence).
            3. Tone: Helpful, friendly, professional.
            4. Format: Plain text, max 3-4 lines. NO bullet points.
            5. Language: Natural Mongolian.
            `;

            const text = await callGemini(prompt);
            return { response: text };
        }

        case "extractPriceTag": {
            const { imageBase64 } = payload;
            if (!imageBase64) throw new HttpsError("invalid-argument", "Image Base64 data is required");

            const prompt = [
                {
                    inlineData: {
                        mimeType: "image/jpeg",
                        data: imageBase64
                    }
                },
                `
                You are a highly accurate, professional OCR and logistics extraction AI for Costco South Korea warehouse price tags.
                Analyze the provided image of a Costco price tag and extract all available product details. We only process South Korean tags.

                CRITICAL EXTRACTION RULES:
                1. PRODUCT CODE:
                   - Look for a 6 or 7-digit code (e.g., "618081", "624871", "680428", "789157"). This is extremely important.
                   - If the code is followed by an asterisk (*) or plus (+), extract it but do NOT include the * or + in the "code" field.

                2. PRODUCT NAME & BRAND:
                   - "extractedName": Full Korean and English product name as written on the label. Keep it complete but clean.
                   - "extractedBrand": Extract the brand name in uppercase if present (e.g., "KIRKLAND SIGNATURE", "STARBUCKS", "SAMSUNG", "TCL", "CJ").

                3. BUNDLE / PACKAGE QUANTITY (БАГЦ ДОТОРХ ШИРХЭГ):
                   - Look closely at the product name and descriptions for bundle/pack details: "940G X 2", "1L 4개", "24개입", "48P", "30롤", "24/12 OZ", "2/40 OZ", "12 CT".
                   - "packageQuantity": Extract the integer count of individual items inside this single bundle/pack (e.g., for "940G X 2" extract 2; for "1L 4개" extract 4; for "30롤" extract 30; for "48P" extract 48; for "24/12 OZ" extract 24; if it is just a single item without any bundle info, extract 1).
                   - "packageUnit": The unit of measurement for individual items (e.g., "개", "팩", "롤", "병", "포", "P", "ct", "oz", "cup").
                   - "extractedBundleInfo": The exact raw string representing this bundle/pack configuration from the label (e.g., "940G X 2", "1L 4개", "48P", "30롤", "24/12 OZ").
                   - "unitSize": The weight/size of a single item in the bundle (e.g., "940G", "1L", "120g", "12 OZ", "40m").

                4. PRICES & DISCOUNTS:
                   - "extractedPrice": The final checkout price in KRW (large numbers at the bottom). Clean it of commas and symbols, return as a whole integer (e.g., 10990).
                   - "extractedOriginalPrice": The original price before discount. If there is no discount, this equals "extractedPrice".
                   - "extractedDiscount": The discount amount (e.g., 4000). Return 0 if no discount.
                   - "hasDiscount": true if there is an explicit discount highlight, "할인행사", "원 할인", or strike-through price.

                5. SUPPLY STATUS & SPECIAL SYMBOLS:
                   - "isDiscontinued": true if an asterisk (*) is present next to the product code or in the upper-right corner.
                   - "restockStatus": "no_restock" if asterisk (*) is found, "uncertain" if plus (+) is found, otherwise "normal".
                   - "priceSecret": "clearance" if the price ends in 70 (e.g. 19,970원), "store_markdown" if it ends in 00 (e.g. 20,000원), "standard" if it ends in 90 (e.g. 19,990원).

                6. LOGISTICS & MEASUREMENTS:
                   - "tagDate": Find any printed printing date stamp if visible (usually very small text on the bottom-right or bottom-left of the tag, e.g. "2026/05/19", "11/15/23"). Return as string.
                   - "weightKg": Calculate the total net shipping weight in kilograms if possible (e.g., for "940G X 2", weight is 1.88; for "1L 4개", weight is 4.0; for liquids, 1 Liter = 1 Kilogram). If not possible to calculate, return null.
                   - "dimensions": Look for dimensions in the specifications (e.g., "크기: 545 X 1,430 X 600MM" or "700x1,755x672MM").
                     * Extract to this object structure: { lengthCm: number, widthCm: number, heightCm: number }
                     * Convert MM to CM by dividing by 10 (e.g. 545mm becomes 54.5cm, 1430mm becomes 143cm, 600mm becomes 60cm). If no dimensions are found, return null.

                7. SPECIFICATIONS:
                   - "extractedSpecs": Extract any other sub-info, bulleted specs (e.g., "▶모델명: RT42CG6024S9", "100g당 585원", "원산지 : 베트남") as a clean text string.

                Respond STRICTLY in this JSON structure:
                {
                  "code": "string (6 or 7-digit code)",
                  "extractedName": "string",
                  "extractedBrand": "string",
                  "packageQuantity": number,
                  "packageUnit": "string",
                  "extractedBundleInfo": "string",
                  "unitSize": "string",
                  "extractedPrice": number,
                  "extractedOriginalPrice": number,
                  "extractedDiscount": number,
                  "hasDiscount": boolean,
                  "isDiscontinued": boolean,
                  "restockStatus": "normal" | "no_restock" | "uncertain",
                  "priceSecret": "standard" | "clearance" | "store_markdown",
                  "tagDate": "string",
                  "weightKg": number | null,
                  "dimensions": {
                    "lengthCm": number,
                    "widthCm": number,
                    "heightCm": number
                  } | null,
                  "extractedSpecs": "string"
                }
                `
            ];

            const text = await callGemini(prompt, { jsonMode: true, temperature: 0.1 });
            try {
                return JSON.parse(text);
            } catch {
                const jsonStr = text.replace(/```json|```/g, "").trim();
                return JSON.parse(jsonStr);
            }
        }

        default:
            throw new HttpsError("invalid-argument", `Unknown action: ${action}`);
    }
});

/**
 * 🔎 Guest order tracking — look up a single order by its ID + the phone number
 * on the order, WITHOUT exposing the orders collection to public reads. Firestore
 * rules keep orders locked to their owner/admin; this callable runs with the
 * Admin SDK and returns only non-sensitive status fields.
 *
 * Best-practice hardening:
 *  - Requires BOTH the exact order id AND a matching phone (last 8 digits) so the
 *    id alone is useless.
 *  - Returns a single uniform "not found" error for a missing order OR a phone
 *    mismatch, so it can't be used as an oracle to enumerate valid order ids.
 *  - Returns only status/date/total/currency + item names & quantities — never
 *    the full address, alternate phones, userId, or other PII.
 */
exports.trackOrder = onCall({
    region: "asia-northeast3",
    timeoutSeconds: 20,
    memory: "128MiB"
}, async (request) => {
    const orderId = (request.data?.orderId || "").toString().trim();
    const phone = (request.data?.phone || "").toString().replace(/\D/g, "");

    if (!orderId || phone.length < 6) {
        throw new HttpsError("invalid-argument", "Захиалгын дугаар болон утасны дугаараа зөв оруулна уу.");
    }

    // Uniform "not found" — never reveal whether the id existed but the phone was wrong.
    const notFound = () =>
        new HttpsError("not-found", "Ийм дугаар, утасны хослолтой захиалга олдсонгүй.");

    const snap = await db.collection("orders").doc(orderId).get();
    if (!snap.exists) throw notFound();

    const data = snap.data() || {};
    const orderPhone = (data.recipientPhone || "").toString().replace(/\D/g, "");

    // Compare on the last 8 digits to tolerate country-code / formatting differences.
    const tail = (s) => s.slice(-8);
    if (!orderPhone || tail(orderPhone) !== tail(phone)) throw notFound();

    // Mask the recipient name (e.g. "Бат***") — confirms the order without leaking the full name.
    const rawName = (data.recipientName || data.customer || "").toString().trim();
    const maskedName = rawName ? rawName.slice(0, 2) + "***" : "";

    return {
        id: snap.id,
        status: data.status || "Хүлээгдэж байна",
        trackingNumber: data.trackingNumber || null,
        estimatedDelivery: data.estimatedDelivery || null,
        deliveredReceiver: data.deliveredReceiver || null,
        deliveredPhoto: data.deliveredPhoto || null,
        // Fulfilment timeline (safe fields only) so the guest sees the same
        // detailed tracking as a logged-in customer.
        trackingStage: data.trackingStage || null,
        trackingHistory: Array.isArray(data.trackingHistory)
            ? data.trackingHistory.slice(0, 50).map((e) => ({
                stage: e?.stage || "",
                label: e?.label || "",
                note: e?.note || "",
                timestamp: e?.timestamp || null
            }))
            : null,
        date: data.date || data.createdAt || null,
        createdAt: data.createdAt || data.date || null,
        cancelledAt: data.cancelledAt || null,
        total: typeof data.total === "number" ? data.total : 0,
        currency: data.currency || "MNT",
        recipientName: maskedName,
        items: Array.isArray(data.items)
            ? data.items.slice(0, 50).map((it) => ({
                name: it?.name || "Бараа",
                quantity: it?.quantity || 1
            }))
            : []
    };
});

/**
 * 🛒 Create an order (guest or logged-in) on the server.
 *
 * Why a function: Firestore rules deny reading a non-existent order doc, so the
 * client cannot reliably check "is this id taken?" to build a clean, sequential
 * order number. The Admin SDK can, so we mint the id here:
 *   DDHH-<last4phone>, then -2, -3 … if the same phone orders again that hour.
 *
 * It also lets guests (no auth session) place orders without weakening the
 * Firestore rules — the order is written with the Admin SDK and stamped with the
 * caller's uid when signed in, or a guest marker otherwise.
 */
exports.createOrder = onCall({
    region: "asia-northeast3",
    timeoutSeconds: 30,
    memory: "256MiB"
}, async (request) => {
    const order = request.data?.order;
    if (!order || !Array.isArray(order.items) || order.items.length === 0) {
        throw new HttpsError("invalid-argument", "Захиалга хоосон байна.");
    }

    const pad = (n) => n.toString().padStart(2, "0");
    const now = new Date();
    // Order number: DDHH + a per-hour sequence. The first 4 digits are the day + hour,
    // which the admin reads straight off (e.g. 1409xx → 14th, 09:00–09:59). The
    // sequence is the 1st free slot that hour: 00, 01, 02 … so it's 6 digits (DDHHNN)
    // for the first 100 orders, and rolls into 3 digits — 7 digits total (DDHHNNN,
    // e.g. 1409100) — only if an hour ever exceeds 100 orders. No dashes.
    const dh = `${pad(now.getDate())}${pad(now.getHours())}`;
    let orderId = null;
    for (let n = 0; n <= 999; n++) {
        const candidate = `${dh}${pad(n)}`; // pad → "00".."99" (6 digits), then "100".."999" (7 digits)
        const snap = await db.collection("orders").doc(candidate).get();
        if (!snap.exists) { orderId = candidate; break; }
    }
    // >1000 orders in a single hour — not realistic; guarantee a unique id anyway.
    if (!orderId) orderId = `${dh}${String(Date.now()).slice(-6)}`;

    // Stamp ownership: the authenticated caller's uid, or a guest marker (guests
    // look their order up later via the trackOrder function using id + phone).
    const userId = request.auth?.uid || `guest-${Date.now()}`;
    const customerEmail = request.auth?.token?.email || "";

    // Never trust a client-sent userId/createdAt/tracking/email — strip then set our own.
    const safeOrder = { ...order };
    delete safeOrder.userId;
    delete safeOrder.createdAt;
    delete safeOrder.trackingStage;
    delete safeOrder.trackingHistory;
    delete safeOrder.customerEmail;
    // Client must never pre-set the price-audit fields below.
    delete safeOrder.priceAudit;

    // SECURITY (price-tampering defence): the client sends item prices and the
    // order total, which it could forge (e.g. total:0). We can't fully recompute
    // the charged total here because shipping/delivery/markup/FX/coupon/tier logic
    // lives on the client, BUT we can pull each item's authoritative warehouse
    // price from Firestore, capture it on the order, and raise a review flag when
    // anything looks off (unknown product, quantity over the customs cap, or a
    // client unit price below the server price). Admins must verify flagged orders
    // before confirming payment. TODO: move the full pricing formula server-side
    // and recompute `total` authoritatively.
    const MAX_SAME_ITEM_QTY = 2; // mirrors the client customs cap
    const auditItems = Array.isArray(order.items) ? order.items : [];
    const auditFlags = [];
    let serverSubtotalKRW = 0;
    await Promise.all(auditItems.map(async (it) => {
        const pid = (it?.id || "").toString();
        const qty = Number(it?.quantity) || 0;
        const clientPrice = Number(it?.price) || 0;
        if (qty < 1 || qty > MAX_SAME_ITEM_QTY) {
            auditFlags.push(`qty:${pid || "?"}=${qty}`);
        }
        if (!pid) { auditFlags.push("missing-id"); return; }
        try {
            const pSnap = await db.collection("products").doc(pid).get();
            if (!pSnap.exists) { auditFlags.push(`unknown:${pid}`); return; }
            const pData = pSnap.data() || {};
            const serverPriceKRW = Number(pData.price || pData.priceKRW || 0);
            serverSubtotalKRW += serverPriceKRW * qty;
            // Client unit price below the warehouse price is the dangerous direction.
            if (serverPriceKRW > 0 && clientPrice > 0 && clientPrice < serverPriceKRW) {
                auditFlags.push(`low-price:${pid}`);
            }
        } catch (e) {
            auditFlags.push(`lookup-fail:${pid}`);
        }
    }));
    const priceAudit = {
        serverSubtotalKRW,
        clientTotal: Number(order.total) || 0,
        flagged: auditFlags.length > 0,
        flags: auditFlags,
        checkedAt: new Date().toISOString()
    };

    // 🎁 Redeem loyalty points (server-authoritative debit). The client asks to spend
    // `pointsRedeemedKRW` won of its balance; we atomically verify (≤ balance AND ≤ 50%
    // of the server goods value) and debit inside a transaction. Throws on tampering so
    // an order is never created with a discount the points didn't actually cover.
    let redeemKRW = Math.max(0, Math.round(Number(order.pointsRedeemedKRW) || 0));
    if (redeemKRW > 0) {
        if (!request.auth?.uid) {
            throw new HttpsError("failed-precondition", "Оноо зарцуулахын тулд нэвтэрнэ үү.");
        }
        const cap = Math.floor(serverSubtotalKRW * 0.5); // max 50% of goods value
        const userRef = db.collection("users").doc(userId);
        await db.runTransaction(async (tx) => {
            const uDoc = await tx.get(userRef);
            const data = (uDoc.exists && uDoc.data()) || {};
            const nowMs = Date.now();
            // Only NON-EXPIRED lots are spendable. Sort oldest-expiry first so the points
            // closest to expiring are used up before they're lost (and purge expired here).
            const lots = (Array.isArray(data.loyaltyLots) ? data.loyaltyLots : [])
                .filter((l) => l && new Date(l.expiresAt).getTime() > nowMs)
                .sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime());
            const available = lots.reduce((s, l) => s + (Number(l.krw) || 0), 0);
            if (redeemKRW > available) {
                throw new HttpsError("failed-precondition", "Оноо хүрэлцэхгүй байна (эсвэл хугацаа дууссан).");
            }
            if (redeemKRW > cap) {
                throw new HttpsError("failed-precondition", "Захиалгын дүнгийн 50% хүртэл оноо зарцуулна.");
            }
            // Draw down oldest-first.
            let rem = redeemKRW;
            const newLots = [];
            for (const l of lots) {
                const k = Number(l.krw) || 0;
                if (rem <= 0) { newLots.push(l); continue; }
                if (k <= rem) { rem -= k; continue; } // lot fully consumed
                newLots.push({ ...l, krw: k - rem }); // partial
                rem = 0;
            }
            const newBalance = newLots.reduce((s, l) => s + (Number(l.krw) || 0), 0);
            tx.update(userRef, { loyaltyLots: newLots, loyaltyPointsKRW: newBalance });
        });
    }

    const createdAt = new Date().toISOString();

    // Seed the fulfilment timeline with the implicit "received" event. The admin
    // then advances the order through the pipeline (see src/utils/orderTracking.js
    // for the stage vocabulary, kept in sync with the legacy `status` field).
    await db.collection("orders").doc(orderId).set({
        ...safeOrder,
        userId,
        customerEmail,
        priceAudit,
        pointsRedeemedKRW: redeemKRW, // authoritative redeemed amount (won)
        status: order.status || "Processing",
        trackingStage: "received",
        trackingHistory: [
            { stage: "received", label: "Захиалга хүлээн авсан", note: "", timestamp: createdAt }
        ],
        createdAt
    });
    if (priceAudit.flagged) {
        console.warn(`Order ${orderId} flagged for price review:`, auditFlags.join(", "));
    }

    // Order-confirmation email (no-op without an email / the Trigger Email extension).
    const itemsLines = (order.items || []).map((it) => `• ${it.name || "Бараа"} ×${it.quantity || 1}`).join("\n");
    await queueMail(
        customerEmail,
        `Захиалга #${orderId} баталгаажлаа`,
        `Таны захиалга амжилттай бүртгэгдлээ.\n\nЗахиалгын дугаар: ${orderId}\nНийт дүн: ${(order.total || 0).toLocaleString()} ${order.currency === "MNT" ? "₮" : "₩"}\n\nБараа:\n${itemsLines}\n\nБид төлбөрийг шалгаад захиалгыг баталгаажуулна. Баярлалаа!`
    );

    // Consume one use of the applied coupon (best-effort; validateCoupon enforces
    // the cap at apply time). Admin SDK bypasses rules, so this can update the doc.
    const usedCode = (order.couponCode || "").toString().trim().toUpperCase();
    if (usedCode) {
        try { await db.collection("coupons").doc(usedCode).update({ used: admin.firestore.FieldValue.increment(1) }); }
        catch (e) { console.warn("coupon usage increment skipped:", e?.message); }
    }

    return { id: orderId, userId };
});

/**
 * 🏷️ Validate a promo / coupon code (server-authoritative so codes aren't
 * enumerable). Returns the coupon terms; the client computes the actual discount
 * in the display currency. Coupons live at coupons/{CODE} (uppercase id).
 */
exports.validateCoupon = onCall({ region: "asia-northeast3", timeoutSeconds: 15 }, async (request) => {
    const code = (request.data?.code || "").toString().trim().toUpperCase();
    const subtotalMNT = Math.round(Number(request.data?.subtotalMNT) || 0);
    if (!code) throw new HttpsError("invalid-argument", "Кодоо оруулна уу.");

    const snap = await db.collection("coupons").doc(code).get();
    if (!snap.exists) throw new HttpsError("not-found", "Купон олдсонгүй.");
    const c = snap.data() || {};
    if (c.active === false) throw new HttpsError("failed-precondition", "Купон идэвхгүй байна.");
    if (c.expiresAt && new Date(c.expiresAt).getTime() < Date.now()) throw new HttpsError("failed-precondition", "Купоны хугацаа дууссан.");
    if (c.minOrderMNT && subtotalMNT < Number(c.minOrderMNT)) {
        throw new HttpsError("failed-precondition", `Доод дүн ${Number(c.minOrderMNT).toLocaleString()}₮ байх шаардлагатай.`);
    }
    if (c.usageLimit && (c.used || 0) >= Number(c.usageLimit)) throw new HttpsError("failed-precondition", "Купоны ашиглах хязгаар дууссан.");

    return {
        valid: true,
        code,
        type: c.type === "fixed" ? "fixed" : "percent",
        value: Number(c.value) || 0,
        minOrderMNT: Number(c.minOrderMNT) || 0,
        label: c.label || "",
    };
});

/**
 * ↩️ Customer-initiated return request. Firestore rules let only admins write
 * orders, so the customer calls this; we verify they own the order, then record
 * the request for the admin to process.
 */
exports.requestReturn = onCall({ region: "asia-northeast3", timeoutSeconds: 15 }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Нэвтэрч орно уу.");
    const orderId = (request.data?.orderId || "").toString();
    const reason = (request.data?.reason || "").toString().slice(0, 500);
    if (!orderId) throw new HttpsError("invalid-argument", "Захиалга буруу байна.");

    const ref = db.collection("orders").doc(orderId);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError("not-found", "Захиалга олдсонгүй.");
    const o = snap.data() || {};
    if (o.userId !== uid) throw new HttpsError("permission-denied", "Энэ захиалга таных биш байна.");
    if (o.returnRequest && o.returnRequest.status === "requested") {
        throw new HttpsError("failed-precondition", "Буцаалтын хүсэлт аль хэдийн илгээгдсэн.");
    }
    await ref.update({ returnRequest: { status: "requested", reason, requestedAt: new Date().toISOString() } });
    return { ok: true };
});

// ============================================================================
// 💳 QPAY ONLINE PAYMENT (QPay v2 merchant API)
// Setup (one-time): put credentials in functions/.env (or Firebase secrets):
//   QPAY_USERNAME, QPAY_PASSWORD, QPAY_INVOICE_CODE
//   QPAY_CALLBACK_URL = the deployed qpayCallback URL (optional but recommended)
// Until configured, createQpayInvoice returns a failed-precondition error and the
// client falls back gracefully (order is still recorded as paymentMethod 'qpay').
// ============================================================================
const QPAY_BASE = process.env.QPAY_BASE_URL || "https://merchant.qpay.mn/v2";

async function qpayToken() {
    const u = process.env.QPAY_USERNAME, p = process.env.QPAY_PASSWORD;
    if (!u || !p) throw new HttpsError("failed-precondition", "QPay тохиргоо байхгүй байна.");
    const r = await fetch(`${QPAY_BASE}/auth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Basic " + Buffer.from(`${u}:${p}`).toString("base64") },
    });
    if (!r.ok) throw new HttpsError("internal", "QPay auth амжилтгүй.");
    const j = await r.json();
    return j.access_token;
}

exports.createQpayInvoice = onCall({ region: "asia-northeast3", timeoutSeconds: 30, memory: "256MiB" }, async (request) => {
    const orderId = (request.data?.orderId || "").toString();
    const amount = Math.round(Number(request.data?.amount) || 0);
    if (!orderId || amount <= 0) throw new HttpsError("invalid-argument", "Захиалга/дүн буруу байна.");
    const invoiceCode = process.env.QPAY_INVOICE_CODE;
    if (!invoiceCode) throw new HttpsError("failed-precondition", "QPay тохиргоо байхгүй байна.");

    const token = await qpayToken();
    const cb = process.env.QPAY_CALLBACK_URL;
    const body = {
        invoice_code: invoiceCode,
        sender_invoice_no: orderId,
        invoice_receiver_code: "terminal",
        invoice_description: `Захиалга #${orderId}`,
        amount,
    };
    if (cb) body.callback_url = `${cb}?order=${encodeURIComponent(orderId)}`;

    const r = await fetch(`${QPAY_BASE}/invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
    });
    if (!r.ok) {
        console.error("QPay invoice error:", await r.text());
        throw new HttpsError("internal", "QPay нэхэмжлэх үүсгэж чадсангүй.");
    }
    const inv = await r.json();
    try {
        await db.collection("orders").doc(orderId).update({
            qpay: { invoiceId: inv.invoice_id, amount, paid: false, createdAt: new Date().toISOString() },
        });
    } catch (e) { console.warn("order qpay update skipped:", e?.message); }

    return { invoiceId: inv.invoice_id, qPayShortUrl: inv.qPay_shortUrl, qrText: inv.qr_text, qrImage: inv.qr_image };
});

// QPay calls this when an invoice is paid → verify, then mark the order paid.
exports.qpayCallback = onRequest({ region: "asia-northeast3" }, async (req, res) => {
    try {
        const orderId = (req.query.order || "").toString();
        if (!orderId) { res.status(400).send("no order"); return; }
        const snap = await db.collection("orders").doc(orderId).get();
        const invoiceId = snap.exists && snap.data().qpay && snap.data().qpay.invoiceId;
        if (!invoiceId) { res.status(200).send("no invoice"); return; }

        const token = await qpayToken();
        const chk = await fetch(`${QPAY_BASE}/payment/check`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ object_type: "INVOICE", object_id: invoiceId, offset: { page_number: 1, page_limit: 100 } }),
        });
        const data = chk.ok ? await chk.json() : null;
        const isPaid = data && Number(data.paid_amount) > 0;
        if (isPaid) {
            // Mark paid AND auto-advance the order to "confirmed" so it lands in the
            // admin's confirmed queue and fires notifyOrderStage (loyalty points + tier
            // + customer notification). Only auto-advance from the initial "received"
            // state so we never regress an order the admin already moved further along.
            const o = snap.data() || {};
            const now = new Date().toISOString();
            const updates = { "qpay.paid": true, "qpay.paidAt": now };
            if ((o.trackingStage || "received") === "received") {
                updates.trackingStage = "confirmed";
                updates.status = "Shipped"; // stageToStatus('confirmed') — counts as live revenue
                updates.trackingHistory = [
                    { stage: "received", label: "Захиалга хүлээн авсан", note: "", timestamp: o.createdAt || o.date || now },
                    { stage: "confirmed", label: "Захиалга баталгаажсан", note: "Онлайн төлбөр (QPay) амжилттай.", timestamp: now },
                ];
            }
            await db.collection("orders").doc(orderId).update(updates);
        }
        res.status(200).send("OK");
    } catch (e) {
        console.error("qpayCallback error:", e);
        res.status(200).send("OK"); // ack to prevent retry storms
    }
});

// ============================================================================
// 💳 WIRE.MN ONLINE PAYMENT
// ============================================================================
const WIRE_BASE = process.env.WIRE_BASE_URL || "https://api.wire.mn/v1";

exports.createWireInvoice = onCall({ region: "asia-northeast3", timeoutSeconds: 30, memory: "256MiB" }, async (request) => {
    const orderId = (request.data?.orderId || "").toString();
    const amount = Math.round(Number(request.data?.amount) || 0);
    if (!orderId || amount <= 0) throw new HttpsError("invalid-argument", "Захиалга/дүн буруу байна.");
    const apiKey = process.env.WIRE_SECRET_KEY;
    if (!apiKey) throw new HttpsError("failed-precondition", "Wire.mn түлхүүр тохируулагдаагүй байна.");

    // Wire.mn LIVE mode REQUIRES allowed_operators to list your activated operator id(s)
    // (per docs "Live болох"). Without it, automatic_operator alone may leave the live
    // charge with no authorised operator → payment_intent.payment_failed. We pin qpay.
    // Override via WIRE_OPERATORS (comma-separated) if your operator id differs.
    const operators = (process.env.WIRE_OPERATORS || 'qpay').split(',').map(s => s.trim()).filter(Boolean);
    const body = {
        amount,
        currency: 'MNT',
        allowed_operators: operators,
        // The QR carries the invoice reference; payment is matched back to the order
        // SERVER-SIDE via metadata.orderId (wireCallback), so the customer never types a
        // transaction memo. `description` just makes the order # visible in the bank app /
        // statement for clarity & manual reconciliation.
        description: `Захиалга #${orderId}`,
        metadata: { orderId: orderId }
    };

    const r = await fetch(`${WIRE_BASE}/payment_intents`, {
        method: "POST",
        headers: { 
            "Content-Type": "application/json", 
            "Authorization": `Bearer ${apiKey}`,
            "Idempotency-Key": orderId // Prevents duplicate charges for the same order
        },
        body: JSON.stringify(body),
    });
    
    if (!r.ok) {
        console.error("Wire.mn intent error:", await r.text());
        throw new HttpsError("internal", "Wire.mn нэхэмжлэх үүсгэж чадсангүй.");
    }
    const inv = await r.json();
    
    // Auto-confirm with qpay to get the QR code
    const confirmBody = {
        operator: "qpay",
        return_url: "https://costco.mn/orders"
    };

    const confirmReq = await fetch(`${WIRE_BASE}/payment_intents/${inv.id}/confirm`, {
        method: "POST",
        headers: { 
            "Content-Type": "application/json", 
            "Authorization": `Bearer ${apiKey}`,
            "Idempotency-Key": orderId + "_confirm"
        },
        body: JSON.stringify(confirmBody),
    });

    if (!confirmReq.ok) {
        console.error("Wire.mn confirm error:", await confirmReq.text());
        throw new HttpsError("internal", "Wire.mn QPay нэхэмжлэх баталгаажсангүй.");
    }
    
    const confirmData = await confirmReq.json();

    try {
        await db.collection("orders").doc(orderId).update({
            wire: { intentId: inv.id || orderId, amount, paid: false, createdAt: new Date().toISOString() },
            paymentMethod: 'wire'
        });
    } catch (e) { console.warn("order wire update skipped:", e?.message); }

    // Wire API v1 returns next_action.qr with base64 image and deeplinks
    const qrData = confirmData.next_action?.qr;
    return { qr: qrData, intentId: inv.id };
});

exports.wireCallback = onRequest({ region: "asia-northeast3" }, async (req, res) => {
    try {
        const event = req.body;
        if (!event || !event.type) {
            res.status(200).send("OK");
            return;
        }

        // 1. HMAC Гарын үсэг шалгах (Security Verification)
        // SECURITY: fail CLOSED. Previously the whole check was skipped when
        // WIRE_WEBHOOK_SECRET was unset, letting anyone forge a payment-confirmed
        // callback. The secret is now mandatory and the digest comparison is
        // constant-time (crypto.timingSafeEqual) to avoid signature timing leaks.
        const secret = process.env.WIRE_WEBHOOK_SECRET;
        if (!secret) {
            console.error("wireCallback: WIRE_WEBHOOK_SECRET not configured — rejecting");
            res.status(503).send("Webhook not configured");
            return;
        }
        {
            const sigHeader = req.headers['wirepayment-signature'];
            if (!sigHeader) {
                console.warn("Missing wirepayment-signature header");
                res.status(400).send("No signature");
                return;
            }

            const pairs = sigHeader.split(',').map(s => s.trim().split('='));
            const t = pairs.find(p => p[0] === 't')?.[1];
            const v1 = pairs.find(p => p[0] === 'v1')?.[1];

            if (!t || !v1) {
                res.status(400).send("Invalid signature format");
                return;
            }

            const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body);
            const payload = t + "." + rawBody;
            const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');

            const now = Math.floor(Date.now() / 1000);
            if (now - parseInt(t, 10) > 300) {
                console.warn("Wire webhook signature expired");
                res.status(400).send("Expired");
                return;
            }

            const expectedBuf = Buffer.from(expected);
            const providedBuf = Buffer.from(String(v1));
            const sigOk = expectedBuf.length === providedBuf.length &&
                crypto.timingSafeEqual(expectedBuf, providedBuf);
            if (!sigOk) {
                console.warn("Wire webhook signature mismatch");
                res.status(400).send("Invalid signature");
                return;
            }
        }

        // 2. Ping / Endpoint Verification хүсэлт шалгах
        if (event.type === 'endpoint.verification') {
            res.status(200).send("OK");
            return;
        }
        
        // 3. Төлбөр амжилттай болсон үеийн логик
        if (event.type === 'payment_intent.succeeded' || event.type === 'charge.succeeded') {
            // Find order ID from metadata
            const orderId = event.data?.metadata?.orderId;
            if (orderId) {
                // Mark paid AND auto-advance to "confirmed" (same as QPay) so the order
                // enters the admin's confirmed queue and fires notifyOrderStage (loyalty
                // points + tier + notification). Only advance from the initial "received".
                const oSnap = await db.collection("orders").doc(orderId).get();
                const o = oSnap.exists ? (oSnap.data() || {}) : {};
                const now = new Date().toISOString();
                const updates = { "wire.paid": true, "wire.paidAt": now };
                if ((o.trackingStage || "received") === "received") {
                    updates.trackingStage = "confirmed";
                    updates.status = "Shipped"; // stageToStatus('confirmed') — counts as live revenue
                    updates.trackingHistory = [
                        { stage: "received", label: "Захиалга хүлээн авсан", note: "", timestamp: o.createdAt || o.date || now },
                        { stage: "confirmed", label: "Захиалга баталгаажсан", note: "Онлайн төлбөр (Wire) амжилттай.", timestamp: now },
                    ];
                }
                await db.collection("orders").doc(orderId).update(updates);
            }
        }
        
        res.status(200).send("OK");
    } catch (e) {
        console.error("wireCallback error:", e);
        res.status(200).send("OK");
    }
});

// ============================================================================
// 📦 DAILY MANIFEST — automatic courier/customs manifest for the prior day's
// new orders. Runs server-side on a schedule (no browser needed): builds the
// machine-readable CSV, stores it at dailyManifests/{date} for the admin to
// download, emails it (if the Trigger Email extension + settings.general
// .manifestEmail are configured), and pushes the admins. The actual customs
// DECLARATION is still filed by a licensed broker from this manifest — this only
// automates producing and delivering the document.
// ============================================================================
function _csvCell(v) {
    const s = String(v == null ? "" : v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function buildManifestCsvServer(orders, productsById, opts) {
    const o = opts || {};
    const wonRate = Number(o.wonRate) || 0;
    const threshold = Number(o.dutyFreeThresholdMNT) > 0 ? Number(o.dutyFreeThresholdMNT) : 6600000;
    const dutyRate = Number(o.dutyRate) >= 0 ? Number(o.dutyRate) : 5;
    const vatRate = Number(o.vatRate) >= 0 ? Number(o.vatRate) : 10;
    const useCost = !!o.useCost;
    const look = (it) => (it && productsById.get(it.id)) || null;
    const descOf = (it) => (look(it) && (look(it).name_en || look(it).englishName)) || (it && it.name) || "Goods";
    const headers = ["№", "Захиалга", "Хүлээн авагч", "Регистр", "Утас", "Хаяг", "Бараа", "HS код", "Тоо", "Үнэ_KRW", "Жин_кг", "Татвар", "Татвар_дүн_₮", "Tracking"];
    const rows = orders.map((order, i) => {
        const items = order.items || [];
        let krw = 0;
        for (const it of items) {
            const p = look(it);
            const q = Number(it.quantity) || 0;
            if (useCost && p && Number(p.costPriceKRW) > 0) {
                krw += Number(p.costPriceKRW) * q;
            } else {
                const sell = (Number(it.price) || 0) * q;
                krw += order.currency === "MNT" ? (wonRate > 0 ? sell / wonRate : 0) : sell;
            }
        }
        const mnt = krw * (wonRate > 0 ? wonRate : 0);
        const qty = items.reduce((a, it) => a + (Number(it.quantity) || 0), 0);
        const net = items.reduce((a, it) => a + ((Number(look(it) && look(it).weight) || 0) * (Number(it.quantity) || 0)), 0);
        const maxSame = items.reduce((m, it) => Math.max(m, Number(it.quantity) || 0), 0);
        const taxable = mnt > threshold || maxSame > 2;
        const duty = taxable ? mnt * dutyRate / 100 : 0;
        const tax = taxable ? duty + (mnt + duty) * vatRate / 100 : 0;
        const contents = items.map((it) => `${descOf(it)} x${Number(it.quantity) || 0}`).join("; ");
        const hsList = [...new Set(items.map((it) => look(it) && look(it).hsCode).filter(Boolean))].join("; ");
        return [i + 1, order.id, order.recipientName || order.customer || "", order.recipientRegister || "",
            order.recipientPhone || "", order.recipientAddress || "", contents, hsList,
            qty, Math.round(krw), net ? net.toFixed(2) : "", taxable ? "Татвартай" : "Татваргүй",
            taxable ? Math.round(tax) : "", order.trackingNumber || ""];
    });
    return "﻿" + [headers, ...rows].map((r) => r.map(_csvCell).join(",")).join("\r\n");
}

exports.dailyManifest = onSchedule({
    schedule: "every day 08:00",
    timeZone: "Asia/Ulaanbaatar",
    retryCount: 2,
    memory: "512MiB",
    timeoutSeconds: 120
}, async () => {
    try {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const snap = await db.collection("orders").where("createdAt", ">=", cutoff).get();
        const orders = [];
        snap.forEach((d) => {
            const data = d.data() || {};
            if (data.status !== "Cancelled" && data.trackingStage !== "cancelled") {
                orders.push({ id: d.id, ...data });
            }
        });
        orders.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

        const dateStr = new Date().toISOString().slice(0, 10);
        if (orders.length === 0) {
            console.log("dailyManifest: no new orders for", dateStr);
            return null;
        }

        // Look up ONLY the products referenced by the day's orders (HS/weight/name).
        const ids = [...new Set(orders.flatMap((o) => (o.items || []).map((it) => it && it.id).filter(Boolean)))];
        const productsById = new Map();
        for (let i = 0; i < ids.length; i += 100) {
            const refs = ids.slice(i, i + 100).map((id) => db.collection("products").doc(id));
            if (refs.length === 0) break;
            const docs = await db.getAll(...refs);
            docs.forEach((p) => { if (p.exists) productsById.set(p.id, p.data()); });
        }

        // wonRate (MNT per KRW) from settings/currency.
        let wonRate = 0;
        try {
            const c = await db.collection("settings").doc("currency").get();
            wonRate = Number(c.exists && c.data().wonRate) || 0;
        } catch (e) { /* ignore */ }

        const csv = buildManifestCsvServer(orders, productsById, { wonRate });

        // Summary (count + how many parcels are taxable under the de-minimis rule).
        let taxableCount = 0;
        orders.forEach((o) => {
            const items = o.items || [];
            const goods = items.reduce((a, it) => a + (Number(it.price) || 0) * (Number(it.quantity) || 0), 0);
            const mnt = o.currency === "MNT" ? goods : goods * wonRate;
            const maxSame = items.reduce((m, it) => Math.max(m, Number(it.quantity) || 0), 0);
            if (mnt > 6600000 || maxSame > 2) taxableCount++;
        });

        await db.collection("dailyManifests").doc(dateStr).set({
            date: dateStr,
            count: orders.length,
            taxableCount,
            csv,
            createdAt: new Date().toISOString()
        });

        // Email via the Firestore "Trigger Email" extension (writes to `mail`).
        // No-op if the extension isn't installed or no manifestEmail is set.
        let manifestEmail = "";
        try {
            const g = await db.collection("settings").doc("general").get();
            manifestEmail = (g.exists && g.data().manifestEmail) || "";
        } catch (e) { /* ignore */ }
        if (manifestEmail) {
            await db.collection("mail").add({
                to: manifestEmail,
                message: {
                    subject: `Өдрийн manifest — ${dateStr} (${orders.length} илгээмж)`,
                    text: `Өнөөдрийн шинэ захиалгын manifest хавсаргав.\nНийт ${orders.length} илгээмж, үүнээс ${taxableCount} татвартай.`,
                    attachments: [{
                        filename: `manifest-${dateStr}.csv`,
                        content: Buffer.from(csv, "utf8").toString("base64"),
                        encoding: "base64"
                    }]
                }
            });
        }

        // Push the admins.
        try {
            const adminsSnap = await db.collection("users").where("isAdmin", "==", true).get();
            const set = new Set();
            adminsSnap.forEach((d) => (d.data().fcmTokens || []).forEach((t) => t && set.add(t)));
            const tokens = [...set].filter(Boolean);
            if (tokens.length) {
                await admin.messaging().sendEachForMulticast({
                    tokens,
                    data: {
                        title: "Өдрийн manifest бэлэн",
                        body: `${orders.length} илгээмж${taxableCount ? ` • ${taxableCount} татвартай` : ""}`,
                        url: "/admin/daily-manifests"
                    }
                });
            }
        } catch (e) { console.error("dailyManifest push failed:", e); }

        console.log(`dailyManifest: ${dateStr} — ${orders.length} orders, ${taxableCount} taxable`);
    } catch (error) {
        console.error("dailyManifest failed:", error);
    }
    return null;
});

/**
 * 🛒 Abandoned-cart reminder. Carts are mirrored to carts/{uid} by cartSync.js;
 * this nudges shoppers who left items ≥ 12h ago (once per abandonment).
 */
exports.abandonedCartReminder = onSchedule({
    schedule: "every day 18:00",
    timeZone: "Asia/Ulaanbaatar",
    retryCount: 1,
    memory: "256MiB",
    timeoutSeconds: 120
}, async () => {
    try {
        const cutoff = Date.now() - 12 * 60 * 60 * 1000;
        const snap = await db.collection("carts").where("itemCount", ">", 0).get();
        for (const d of snap.docs) {
            const c = d.data() || {};
            if (c.reminded) continue;
            if (c.updatedAt && new Date(c.updatedAt).getTime() > cutoff) continue; // too recent
            const uid = d.id;
            const uSnap = await db.collection("users").doc(uid).get();
            const u = uSnap.exists ? (uSnap.data() || {}) : {};
            const body = `Таны сагсанд ${c.itemCount} бараа хүлээж байна. Захиалгаа дуусгаарай!`;
            const tokens = ((u.fcmTokens) || []).filter(Boolean);
            if (tokens.length) {
                try { await admin.messaging().sendEachForMulticast({ tokens, data: { title: "Сагсаа мартсан уу?", body, url: "/cart" } }); }
                catch (e) { console.warn("cart push failed:", e && e.message); }
            }
            if (u.email) await queueMail(u.email, "Сагсаа мартсан уу?", body);
            await d.ref.update({ reminded: true, remindedAt: new Date().toISOString() });
        }
    } catch (error) {
        console.error("abandonedCartReminder failed:", error);
    }
    return null;
});

/**
 * 🔔 Notify the customer when their order advances to a new fulfilment stage.
 * Fires on order update; pushes the owning account (users/{userId}.fcmTokens)
 * only when trackingStage actually changed. Guests (no account) are skipped.
 */
const ORDER_STAGE_LABELS = {
    confirmed: "Захиалга баталгаажлаа",
    purchased: "Солонгост худалдаж авлаа",
    warehouse: "Солонгосын агуулахад хүлээн авлаа",
    shipped: "Монгол руу ачигдлаа",
    customs: "Гаалийн бүрдүүлэлтэд орлоо",
    arrived_ub: "Улаанбаатарт ирлээ",
    out_for_delivery: "Хүргэлтэнд гарлаа",
    delivered: "Амжилттай хүргэгдлээ",
    cancelled: "Захиалга цуцлагдлаа",
};

exports.notifyOrderStage = onDocumentUpdated({
    document: "orders/{orderId}",
    database: FIRESTORE_DATABASE_ID,
    region: "us-central1"
}, async (event) => {
    const before = event.data && event.data.before && event.data.before.data();
    const after = event.data && event.data.after && event.data.after.data();
    if (!before || !after) return null;

    const stageChanged = after.trackingStage && after.trackingStage !== before.trackingStage && after.trackingStage !== "received";
    const beforeCharges = (before.additionalCharges || []).length;
    const afterCharges = (after.additionalCharges || []).length;
    const chargeAdded = afterCharges > beforeCharges;
    if (!stageChanged && !chargeAdded) return null;

    const userId = after.userId;

    // 🎉 Launch bonus (loyalty): the launch promo is NOT an upfront price cut — instead,
    // when a launch order is confirmed (payment verified) we credit the buyer the launch
    // percent (e.g. 5%) of the SERVER-authoritative goods value as loyalty points, stored
    // in WON (loyaltyPointsKRW). Idempotent via the pointsCredited flag. Server-only:
    // clients can never write loyaltyPointsKRW (firestore.rules blocks it).
    if (after.trackingStage === "confirmed" && after.launchSale && !after.pointsCredited &&
        userId && !String(userId).startsWith("guest-")) {
        try {
            const goodsKRW = Number(after.priceAudit?.serverSubtotalKRW) || 0;
            const sSnap = await db.collection("settings").doc("general").get();
            const ls = sSnap.exists ? (sSnap.data()?.launchSale || {}) : {};
            const pct = Number(ls.percent ?? ls.pointsPercent) || 0; // launch % (back-compat with pointsPercent)
            const pointsKRW = Math.max(0, Math.round(goodsKRW * pct / 100));
            if (pointsKRW > 0) {
                // Each bonus is a LOT that expires 1 month after it is credited. We keep an
                // aggregate loyaltyPointsKRW (for display/cap) AND the per-lot ledger
                // loyaltyLots[]. Redemption draws from lots oldest-first; the daily
                // expireLoyaltyBonus job removes lots past expiresAt. (See firestore.rules:
                // both fields are server-only.)
                const nowD = new Date();
                const expiresD = new Date(nowD);
                expiresD.setMonth(expiresD.getMonth() + 1); // 1 сар
                const lot = {
                    krw: pointsKRW,
                    creditedAt: nowD.toISOString(),
                    expiresAt: expiresD.toISOString(),
                    orderId: event.params.orderId
                };
                await db.collection("users").doc(userId).update({
                    loyaltyPointsKRW: admin.firestore.FieldValue.increment(pointsKRW),
                    loyaltyLots: admin.firestore.FieldValue.arrayUnion(lot),
                });
            }
            await event.data.after.ref.update({ pointsCredited: true, pointsCreditedKRW: pointsKRW });
            console.log(`Loyalty: credited ₩${pointsKRW} to ${userId} for order ${event.params.orderId}`);
        } catch (e) {
            console.error("loyalty credit failed:", e);
        }
    }

    // 🏆 Membership tier: recompute the buyer's lifetime spend (₩) from server-authoritative
    // order values whenever a stage changes, and persist totalSpendKRW + tier on the user.
    // We RECOMPUTE (not increment) so cancellations self-correct: an order only counts while
    // its stage is confirmed-or-beyond and not cancelled. Spend uses the pre-discount
    // warehouse value (priceAudit.serverSubtotalKRW) — generous to the customer.
    if (stageChanged && userId && !String(userId).startsWith("guest-")) {
        try {
            const QUALIFYING = ["confirmed", "purchased", "warehouse", "shipped", "customs", "arrived_ub", "out_for_delivery", "delivered"];
            const snap = await db.collection("orders").where("userId", "==", userId).get();
            let totalKRW = 0;
            snap.forEach((d) => {
                const o = d.data() || {};
                if (QUALIFYING.includes(o.trackingStage)) {
                    totalKRW += Number(o.priceAudit?.serverSubtotalKRW) || 0;
                }
            });
            totalKRW = Math.round(totalKRW);
            let tier = "Silver";
            if (totalKRW >= 20000000) tier = "Platinum";
            else if (totalKRW >= 10000000) tier = "Gold";
            await db.collection("users").doc(userId).update({ totalSpendKRW: totalKRW, tier });
            console.log(`Tier: ${userId} → ${tier} (₩${totalKRW})`);
        } catch (e) {
            console.error("tier recompute failed:", e);
        }
    }

    if (!userId || String(userId).startsWith("guest-")) return null; // guests have no account/tokens

    try {
        let body;
        if (chargeAdded) {
            const last = after.additionalCharges[afterCharges - 1] || {};
            body = `Нэмэлт төлбөр: ${Math.round(Number(last.amount) || 0).toLocaleString()}₮${last.label ? ` (${last.label})` : ""}`;
        } else {
            body = ORDER_STAGE_LABELS[after.trackingStage] || "Захиалгын төлөв шинэчлэгдлээ";
        }

        // Email the customer too (if the order carries an email).
        if (after.customerEmail) {
            await queueMail(after.customerEmail, `Захиалга #${event.params.orderId} — шинэчлэл`, `${body}\n\nДэлгэрэнгүйг апп-аас харна уу.`);
        }

        const uSnap = await db.collection("users").doc(userId).get();
        const tokens = ((uSnap.exists && uSnap.data().fcmTokens) || []).filter(Boolean);
        if (tokens.length === 0) return null;
        const resp = await admin.messaging().sendEachForMulticast({
            tokens,
            data: { title: `Захиалга #${event.params.orderId}`, body, url: "/orders" },
        });

        // Prune dead tokens.
        if (resp.failureCount > 0) {
            const dead = [];
            resp.responses.forEach((r, i) => {
                const code = (!r.success && r.error && r.error.code) || "";
                if (code.includes("registration-token-not-registered") || code.includes("invalid-argument")) dead.push(tokens[i]);
            });
            if (dead.length) {
                await db.collection("users").doc(userId).update({
                    fcmTokens: admin.firestore.FieldValue.arrayRemove(...dead),
                });
            }
        }
    } catch (e) {
        console.error("notifyOrderStage failed:", e);
    }
    return null;
});

/**
 * 🔔 Send an FCM push when a new chat message is created.
 *  - Admin reply  → push the conversation's user (tokens on chats/{cid}.userTokens).
 *  - User message → push all admins (tokens on users where isAdmin == true).
 * Tokens are registered client-side by pushService.js. No-op if nobody has a token
 * (e.g. push not configured), so this is safe to deploy before FCM is enabled.
 */
exports.notifyChatMessage = onDocumentCreated({
    document: 'chats/{cid}/messages/{mid}',
    database: FIRESTORE_DATABASE_ID,
    region: 'us-central1'
}, async (event) => {
    const msg = event.data && event.data.data();
    if (!msg) return null;
    const cid = event.params.cid;

    const convSnap = await db.collection('chats').doc(cid).get();
    const conv = convSnap.exists ? convSnap.data() : {};

    const preview = (msg.text && msg.text.trim())
        ? msg.text.trim().slice(0, 120)
        : (msg.attachment ? '📎 Хавсралт' : 'Шинэ мессеж');

    let tokens = [];
    let title;
    let clickUrl;

    if (msg.isFromAdmin) {
        tokens = Array.isArray(conv.userTokens) ? conv.userTokens : [];
        title = 'Costco Mongolia';
        clickUrl = '/chat';
    } else {
        const adminsSnap = await db.collection('users').where('isAdmin', '==', true).get();
        const set = new Set();
        adminsSnap.forEach((d) => (d.data().fcmTokens || []).forEach((t) => t && set.add(t)));
        tokens = [...set];
        title = `Шинэ чат: ${conv.userName || 'Зочин'}`;
        clickUrl = '/admin/chat';
    }

    tokens = tokens.filter(Boolean);
    if (tokens.length === 0) return null;

    try {
        // DATA-ONLY payload — the web SW (firebase-messaging-sw.js) builds the
        // notification from data so it never double-displays.
        const resp = await admin.messaging().sendEachForMulticast({
            tokens,
            data: { title, body: preview, url: clickUrl, conversationId: cid },
        });

        // Prune dead tokens from the conversation (admin-reply path only).
        if (msg.isFromAdmin && resp.failureCount > 0) {
            const dead = [];
            resp.responses.forEach((r, i) => {
                const code = (!r.success && r.error && r.error.code) || '';
                if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) {
                    dead.push(tokens[i]);
                }
            });
            if (dead.length) {
                await db.collection('chats').doc(cid).update({
                    userTokens: admin.firestore.FieldValue.arrayRemove(...dead),
                });
            }
        }
    } catch (e) {
        console.error('notifyChatMessage send failed:', e);
    }
    return null;
});

/**
 * ⭐ Recompute the products_ratings aggregate whenever a review is added, edited or
 * deleted. Runs with the Admin SDK so clients no longer need write access to
 * products_ratings — Firestore rules now deny client writes there, closing a
 * tampering hole where any signed-in user could overwrite a product's rating.
 */
exports.recalcProductRating = onDocumentWritten({
    document: 'reviews/{reviewId}',
    database: FIRESTORE_DATABASE_ID,
    region: 'us-central1'
}, async (event) => {
    const after = event.data && event.data.after && event.data.after.data();
    const before = event.data && event.data.before && event.data.before.data();
    const productId = (after && after.productId) || (before && before.productId);
    if (!productId) return null;

    const snap = await db.collection('reviews').where('productId', '==', productId).get();
    let count = 0;
    let sum = 0;
    snap.forEach((d) => {
        const r = d.data();
        count += 1;
        sum += (r.rating || 0);
    });
    const avg = count > 0 ? Math.round((sum / count) * 10) / 10 : 0;

    await db.collection('products_ratings').doc(String(productId)).set({
        averageRating: avg,
        reviewCount: count,
        updatedAt: new Date().toISOString()
    }, { merge: true });
    return null;
});

// ============================================================================
// 📱 SMS VERIFICATION — Phone-based registration / login
// Users see a 3-digit code on screen, send it via SMS to the business number
// (60649999). An Android gateway app forwards the SMS here. The server verifies
// the code + sender phone, then issues a Firebase Custom Token.
// ============================================================================

const SMS_CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const SMS_RATE_LIMIT_MS = 60 * 1000;   // 1 request per minute per phone
const SMS_BUSINESS_NUMBER = "60649999";

/**
 * 📱 Step 1: Client requests a verification code.
 * Returns { sessionId, code } — the code is shown on screen for the user to SMS.
 */
exports.requestSmsCode = onCall({
    region: "asia-northeast3",
    timeoutSeconds: 15,
    memory: "128MiB"
}, async (request) => {
    const phone = (request.data?.phone || "").toString().replace(/\D/g, "");
    if (phone.length < 8) {
        throw new HttpsError("invalid-argument", "Утасны дугаар буруу байна.");
    }

    // 🧪 TEST ACCOUNT: a single fixed phone whose code is always "888" and which
    // auto-verifies without a real SMS round-trip — for QA / app-review logins.
    // NOTE: this is NOT an admin account (the created user has isAdmin:false), so it
    // can't escalate privilege; anyone who knows it can sign in as this shared test
    // user only. Remove it (or gate behind an env flag) before a hardened release.
    const TEST_PHONE = "95550011";
    const TEST_CODE = "888";
    if (phone === TEST_PHONE) {
        const now = new Date();
        const sessionId = `sms_${phone}_${now.getTime()}`;
        await db.collection("sms_codes").doc(sessionId).set({
            phone,
            code: TEST_CODE,
            verified: true, // auto-verified: no Android SMS gateway needed for the test number
            createdAt: now.toISOString(),
            expiresAt: new Date(now.getTime() + SMS_CODE_TTL_MS).toISOString()
        });
        console.log(`SMS TEST code issued: phone=${phone}, code=${TEST_CODE}`);
        return { sessionId, code: TEST_CODE, businessNumber: SMS_BUSINESS_NUMBER };
    }

    // Rate limit: 1 code per phone per minute
    const recentSnap = await db.collection("sms_codes")
        .where("phone", "==", phone)
        .where("createdAt", ">", new Date(Date.now() - SMS_RATE_LIMIT_MS).toISOString())
        .limit(1)
        .get();
    if (!recentSnap.empty) {
        throw new HttpsError("resource-exhausted", "Та 1 минут хүлээнэ үү.");
    }

    // Generate 6-digit code (100000-999999). 3-digit codes (900 combos) were
    // trivially brute-forceable; widen the space so a code can't be guessed.
    const code = String(crypto.randomInt(100000, 1000000));
    const now = new Date();
    const sessionId = `sms_${phone}_${now.getTime()}`;

    await db.collection("sms_codes").doc(sessionId).set({
        phone,
        code,
        // SECURITY: never auto-verify. The previous `phone === "00880088"` shortcut
        // was an UNAUTHENTICATED ADMIN BACKDOOR — anyone could mint that admin
        // account. Admin access is now granted only via a custom claim set by the
        // server-side grant-admin script (see scripts/grant-admin.cjs).
        verified: false,
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + SMS_CODE_TTL_MS).toISOString()
    });

    console.log(`SMS code requested: phone=${phone}, session=${sessionId}`);
    return { sessionId, code, businessNumber: SMS_BUSINESS_NUMBER };
});

/**
 * 📱 Step 2: Android SMS gateway forwards incoming messages here.
 * HTTP POST: { from: "99112233", body: "472", secret: "..." }
 * Finds matching pending sms_codes doc and marks it verified.
 */
exports.smsWebhook = onRequest({
    region: "asia-northeast3",
    timeoutSeconds: 15,
    memory: "128MiB"
}, async (req, res) => {
    if (req.method !== "POST") { res.status(405).send("POST only"); return; }

    try {
        const { from, body, secret } = req.body || {};
        const webhookSecret = process.env.SMS_WEBHOOK_SECRET;
        // SECURITY: fail CLOSED. Previously, if SMS_WEBHOOK_SECRET was unset the
        // check was skipped, so anyone could POST and verify any pending code →
        // full SMS-verification bypass. Now a configured secret is mandatory and
        // the comparison is constant-time.
        if (!webhookSecret) {
            console.error("smsWebhook: SMS_WEBHOOK_SECRET not configured — rejecting");
            res.status(503).send("Webhook not configured");
            return;
        }
        const providedSecret = (secret || "").toString();
        const secretOk = providedSecret.length === webhookSecret.length &&
            crypto.timingSafeEqual(Buffer.from(providedSecret), Buffer.from(webhookSecret));
        if (!secretOk) {
            console.warn("smsWebhook: invalid secret");
            res.status(403).send("Forbidden");
            return;
        }

        const senderPhone = (from || "").toString().replace(/\D/g, "");
        const smsBody = (body || "").toString().trim();

        if (!senderPhone || !smsBody) {
            res.status(400).send("Missing from or body");
            return;
        }

        // Find matching pending code: phone matches last 8 digits, code matches, not expired
        const tail = (s) => s.slice(-8);
        const nowISO = new Date().toISOString();

        const snap = await db.collection("sms_codes")
            .where("code", "==", smsBody)
            .where("verified", "==", false)
            .where("expiresAt", ">", nowISO)
            .limit(10)
            .get();

        let matched = false;
        for (const doc of snap.docs) {
            const data = doc.data();
            if (tail(data.phone) === tail(senderPhone)) {
                await doc.ref.update({
                    verified: true,
                    verifiedAt: new Date().toISOString(),
                    senderPhone: senderPhone
                });
                matched = true;
                console.log(`SMS verified: session=${doc.id}, phone=${senderPhone}`);
                break;
            }
        }

        if (!matched) {
            console.log(`smsWebhook: no matching code for phone=${senderPhone}, body=${smsBody}`);
        }

        res.status(200).send("OK");
    } catch (e) {
        console.error("smsWebhook error:", e);
        res.status(200).send("OK"); // ack to prevent retries
    }
});

/**
 * 📱 Step 3: Client polls this to check if SMS was received & verified.
 * Once verified, creates/finds the Firebase Auth user and returns a Custom Token.
 */
exports.verifySmsCode = onCall({
    region: "asia-northeast3",
    timeoutSeconds: 15,
    memory: "128MiB"
}, async (request) => {
    const sessionId = (request.data?.sessionId || "").toString();
    if (!sessionId) throw new HttpsError("invalid-argument", "Session ID шаардлагатай.");

    const snap = await db.collection("sms_codes").doc(sessionId).get();
    if (!snap.exists) throw new HttpsError("not-found", "Session олдсонгүй.");

    const data = snap.data();

    // Check expiry
    if (new Date(data.expiresAt).getTime() < Date.now()) {
        throw new HttpsError("deadline-exceeded", "Кодын хугацаа дууссан. Дахин оролдоно уу.");
    }

    // Not yet verified — client should keep polling
    if (!data.verified) {
        return { pending: true };
    }

    // Verified! Create or find the Firebase Auth user via shadow email.
    const phone = data.phone;
    const shadowEmail = `${phone}@sms.costco.mn`;
    // SECURITY: random per-account password. The old deterministic value
    // (`SMS$${phone}$CostcoVerified2026`) let anyone who knew the formula sign in
    // as any phone via the Email/Password provider. The password is never reused
    // by the client (login happens through the minted custom token below), so a
    // throwaway random secret is enough — even with the Email/Password provider
    // enabled (the admin login still uses it) these accounts can't be guessed.
    const shadowPassword = `SMS$${crypto.randomBytes(24).toString("hex")}`;

    let uid;
    try {
        // Try to find existing user
        const existing = await admin.auth().getUserByEmail(shadowEmail);
        uid = existing.uid;
    } catch (e) {
        if (e.code === "auth/user-not-found") {
            // Create new user
            const newUser = await admin.auth().createUser({
                email: shadowEmail,
                password: shadowPassword,
                displayName: `+976${phone}`
            });
            uid = newUser.uid;

            // Create Firestore user doc
            await db.collection("users").doc(uid).set({
                uid,
                phone: `+976${phone}`,
                name: null,
                isAdmin: false,
                loginProvider: "sms",
                registrationMethod: "sms",
                followStatus: { facebook: null, instagram: null },
                createdAt: new Date().toISOString()
            });
        } else {
            throw new HttpsError("internal", "Auth алдаа: " + (e.message || ""));
        }
    }

    // Update last login in Firestore
    await db.collection("users").doc(uid).set({
        lastLogin: new Date().toISOString(),
        loginProvider: "sms"
    }, { merge: true });

    // Mint a Custom Token
    const token = await admin.auth().createCustomToken(uid);

    // Clean up the sms_codes doc
    await snap.ref.delete();
    console.log(`SMS login success: phone=${phone}, uid=${uid}`);
    return { success: true, token, uid, phone: `+976${phone}` };
});
