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

/**
 * Admin Login Cloud Function
 * - Reads admin credentials from Firestore (settings/admin_auth)
 * - Verifies phone + PIN
 * - Creates/updates Firebase Auth user with isAdmin custom claim
 * - Returns a custom token for client-side signInWithCustomToken
 */
exports.verifyAdminLogin = onCall({
    region: "us-central1"
}, async (request) => {
    const { phone, pin } = request.data;

    if (!phone || !pin) {
        throw new HttpsError("invalid-argument", "Phone and PIN are required");
    }

    // 1. Read admin config from Firestore
    const adminDoc = await db.collection("settings").doc("admin_auth").get();
    if (!adminDoc.exists) {
        throw new HttpsError("not-found", "Admin configuration not found");
    }

    const adminConfig = adminDoc.data();
    const { phone: adminPhone, pinHash, secret } = adminConfig;

    // 2. Verify credentials
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone !== adminPhone) {
        throw new HttpsError("permission-denied", "Хандах эрхгүй байна");
    }

    const inputHash = hashPin(pin, secret);
    if (inputHash !== pinHash) {
        throw new HttpsError("permission-denied", "ПИН код буруу байна");
    }

    // 3. Create/update Firebase Auth user & set custom claims
    try {
        const email = `${cleanPhone}@costco.mn`;
        let userRecord;

        try {
            userRecord = await admin.auth().getUserByEmail(email);
        } catch (e) {
            // User doesn't exist — create
            userRecord = await admin.auth().createUser({
                email: email,
                password: crypto.randomBytes(32).toString("hex"), // Random strong password
                displayName: "Admin"
            });
        }

        // Set admin custom claims
        await admin.auth().setCustomUserClaims(userRecord.uid, { isAdmin: true });

        // Update Firestore profile
        await db.collection("users").doc(userRecord.uid).set({
            phone: `+976${cleanPhone}`,
            isAdmin: true,
            updatedAt: new Date().toISOString()
        }, { merge: true });

        // Create custom token
        const customToken = await admin.auth().createCustomToken(userRecord.uid, { isAdmin: true });

        return { success: true, token: customToken, uid: userRecord.uid };

    } catch (error) {
        console.error("Admin login error:", error);
        throw new HttpsError("internal", "Admin нэвтрэлт амжилтгүй: " + error.message);
    }
});

/**
 * Utility: Setup admin auth credentials in Firestore
 * Call once to initialize: setupAdminAuth({ phone: "XXXXXXXX", pin: "YYYY" })
 * This should be called from Firebase shell or Admin SDK only
 */
exports.setupAdminAuth = onCall({
    region: "us-central1"
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

// ============================================================
// 🤖 AI PROXY: Server-side Gemini API proxy
// Keeps the API key on the server, never exposed to clients
// ============================================================
const { GoogleGenerativeAI } = require("@google/generative-ai");

const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_FALLBACK = "gemini-1.5-flash";

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
    region: "us-central1",
    timeoutSeconds: 60,
    memory: "256MiB"
}, async (request) => {
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

        default:
            throw new HttpsError("invalid-argument", `Unknown action: ${action}`);
    }
});
