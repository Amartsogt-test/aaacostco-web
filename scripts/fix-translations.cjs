
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

// 1. Config
const API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
const SERVICE_ACCOUNT_PATH = path.join(__dirname, '../functions/service-account.json');
const COLLECTION_NAME = 'products';
const MODEL_NAME = 'gemini-2.0-flash';
const FALLBACK_MODEL = 'gemini-1.5-flash';

// Rate Limiting
const BATCH_LIMIT = 10000; // Process all items
const DELAY_MS = 5000; // 5 seconds delay

// Korean Regex
const KOREAN_REGEX = /[\u3131-\uD79D]/ugi;
const WON_REGEX = /₩/g;

// 2. Initialize
if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error(`Error: Service account not found at ${SERVICE_ACCOUNT_PATH}`);
    process.exit(1);
}
const serviceAccount = require(SERVICE_ACCOUNT_PATH);
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();
const genAI = new GoogleGenerativeAI(API_KEY);

// Helper to check for Korean
const hasKorean = (text) => {
    if (!text) return false;
    const str = typeof text === 'string' ? text : JSON.stringify(text);
    return KOREAN_REGEX.test(str) || WON_REGEX.test(str);
};

// Robust AI Call with Infinite Retry
async function callAI(prompt, modelId = 'gemini-2.0-flash') {
    const m = genAI.getGenerativeModel({ model: modelId });

    while (true) {
        try {
            const result = await m.generateContent(prompt);
            return result.response.text();
        } catch (error) {
            if (error.message.includes('429') || error.message.includes('503')) {
                console.log(`      ⏳ Quota hit (${modelId}). Waiting 60s...`);
                await new Promise(r => setTimeout(r, 60000)); // Wait 1 minute
            } else {
                console.error(`      ❌ AI Fatal Error: ${error.message}`);
                throw error;
            }
        }
    }
}

async function fixProduct(product) {
    const updates = {};
    let fixCount = 0;

    console.log(`   🔧 Fixing: ${product.name_mn || product.name}...`);

    try {
        // 1. Fix Name
        if (hasKorean(product.name_mn)) {
            const p = `Translate this product name to Mongolian (Cyrillic). Return ONLY the text:\n${product.name_mn || product.name}`;
            const res = await callAI(p);
            updates.name_mn = res.trim();
            fixCount++;
            console.log(`      - Name fixed`);
        }

        // 2. Fix Description
        if (hasKorean(product.description_mn)) {
            // Keep HTML
            const p = `Translate this HTML description to Mongolian. Keep all HTML tags intact. Return only HTML:\n${(product.description_mn || product.description).substring(0, 4000)}`;
            const res = await callAI(p);
            updates.description_mn = res.replace(/```html|```/g, '').trim();
            fixCount++;
            console.log(`      - Description fixed`);
        }

        // 3. Fix Specs
        if (hasKorean(product.specifications_mn)) {
            const specsStr = JSON.stringify(product.specifications || product.specifications_mn);
            const p = `Translate these specifications to Mongolian. keys should be translated too if they are Korean. Return valid JSON array:\n${specsStr}`;
            const res = await callAI(p);
            try {
                const jsonStr = res.replace(/```json|```/g, '').trim();
                updates.specifications_mn = JSON.parse(jsonStr);
                fixCount++;
                console.log(`      - Specs fixed`);
            } catch (e) {
                console.warn(`      - Specs JSON parse failed: ${e.message}`);
            }
        }

        return updates;

    } catch (err) {
        console.error(`      ❌ AI Error: ${err.message}`);
        return null; // Skip update
    }
}

async function run() {
    console.log('🚀 Starting Translation Repair Script...');

    // We fetch ALL active products and check locally to avoid complex queries
    // Or we scan specifically. Let's fetch all (7000 is manageable in memory for ID list)
    // Actually, let's use the audit logic to find targets.

    const snapshot = await db.collection(COLLECTION_NAME).select('name_mn', 'description_mn', 'specifications_mn', 'translationStatus').get();

    const targets = [];
    snapshot.forEach(doc => {
        const d = doc.data();
        if (d.translationStatus === 'manual_required') return; // Skip known unfixable

        if (hasKorean(d.name_mn) || hasKorean(d.description_mn) || hasKorean(d.specifications_mn)) {
            targets.push({ id: doc.id, ...d });
        }
    });

    console.log(`Found ${targets.length} candidates with Korean text.`);

    let processed = 0;
    let saved = 0;

    for (const t of targets) {
        if (processed >= BATCH_LIMIT) {
            console.log(`Reached batch limit ${BATCH_LIMIT}. Exiting.`);
            break;
        }

        // Fetch full data for context
        const fullDoc = await db.collection(COLLECTION_NAME).doc(t.id).get();
        const product = { id: t.id, ...fullDoc.data() };

        const updates = await fixProduct(product);

        if (updates && Object.keys(updates).length > 0) {
            // Check if Korean still exists in the NEW data
            const stillHasKorean = hasKorean(updates.name_mn || product.name_mn) ||
                hasKorean(updates.description_mn || product.description_mn) ||
                hasKorean(updates.specifications_mn || product.specifications_mn);

            if (stillHasKorean) {
                console.log(`      ⚠️ Korean text persists. Marking for manual review.`);
                updates.translationStatus = 'manual_required';
            } else {
                updates.translationStatus = 'fixed';
            }

            updates.translationFixedAt = admin.firestore.FieldValue.serverTimestamp();
            await db.collection(COLLECTION_NAME).doc(t.id).update(updates);
            saved++;
            console.log(`      ✅ Saved Updates.`);
        } else {
            console.log(`      ⏭️ No changes or failed.`);
            // If it had Korean but AI returned nothing, maybe mark as review needed
            await db.collection(COLLECTION_NAME).doc(t.id).update({
                translationStatus: 'manual_required',
                translationFixedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        processed++;
        await new Promise(r => setTimeout(r, DELAY_MS));
    }

    console.log(`Done. Processed: ${processed}, Saved: ${saved}`);
    process.exit(0);
}

run().catch(console.error);
