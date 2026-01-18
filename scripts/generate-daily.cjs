
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const fs = require('fs');

// 1. Config
const API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyBtJ68dcLuFTvo9C_1NWQ-vMlat_K-8_jM';
const SERVICE_ACCOUNT_PATH = path.join(__dirname, '../functions/service-account.json');
const COLLECTION_NAME = 'products';
const MODEL_NAME = 'gemini-2.0-flash-exp';

// Rate Limiting (Daily is smaller volume, but safety first)
const DELAY_MS = 8000; // 8 seconds between products

// Regex
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

// 3. Helpers
const hasKorean = (text) => {
    if (!text) return false;
    const str = typeof text === 'string' ? text : JSON.stringify(text);
    return KOREAN_REGEX.test(str) || WON_REGEX.test(str);
};

async function callAI(prompt) {
    const m = genAI.getGenerativeModel({ model: MODEL_NAME });
    let attempts = 0;
    while (attempts < 3) {
        try {
            const result = await m.generateContent(prompt);
            return result.response.text();
        } catch (error) {
            if (error.message.includes('429')) {
                console.log(`      ⏳ Quota hit (429). Waiting 30s...`);
                await new Promise(r => setTimeout(r, 30000));
                attempts++;
            } else {
                throw error;
            }
        }
    }
    throw new Error('Max retries reached');
}

// ------------------------------------------------------------------
// PIPELINE FUNCTIONS
// ------------------------------------------------------------------

async function fixWeight(p) {
    // Only fix if 0 or suspicious
    if (p.weight > 0.5 && !hasKorean(p.name)) return null; // Assume OK if weight exists and > 0.5kg (simple heuristic)
    if (p.weight > 0 && p.aiWeight) return null; // Already fixed

    const context = `Name: ${p.name_mn || p.name}, Specs: ${JSON.stringify(p.specifications_mn || p.specifications || [])}`;
    const prompt = `Calculate TOTAL shipping weight (kg) for: ${context}. Return JSON {"weightKg": number, "reason": "string"}`;

    try {
        const res = await callAI(prompt);
        const json = JSON.parse(res.replace(/```json|```/g, '').trim());
        if (json.weightKg > 0) return { weight: json.weightKg, aiWeight: json.weightKg, aiWeightReason: json.reason };
    } catch (e) {
        console.warn(`      ⚠️ Weight fix failed: ${e.message}`);
    }
    return null;
}

async function fixTranslation(p) {
    const updates = {};
    let changed = false;

    try {
        if (hasKorean(p.name_mn)) {
            const res = await callAI(`Translate name to Mongolian (Cyrillic) ONLY:\n${p.name_mn || p.name}`);
            updates.name_mn = res.trim();
            changed = true;
        }
        if (hasKorean(p.description_mn)) {
            const res = await callAI(`Translate HTML description to Mongolian. Keep HTML:\n${(p.description_mn || p.description).substring(0, 2000)}`);
            updates.description_mn = res.replace(/```html|```/g, '').trim();
            changed = true;
        }
        if (hasKorean(p.specifications_mn)) {
            const res = await callAI(`Translate JSON specs to Mongolian. Return JSON:\n${JSON.stringify(p.specifications || p.specifications_mn)}`);
            updates.specifications_mn = JSON.parse(res.replace(/```json|```/g, '').trim());
            changed = true;
        }
    } catch (e) {
        console.warn(`      ⚠️ Transl fix failed: ${e.message}`);
    }

    return changed ? updates : null;
}

async function generateDesc(p) {
    if (p.shortDescription && p.shortDescription.length > 10) return null;

    try {
        const prompt = `Write a 1-sentence Mongolian summary for: ${p.name_mn || p.name}. Friendly tone. Plain text only.`;
        const res = await callAI(prompt);
        return { shortDescription: res.trim(), shortDescriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp() };
    } catch (e) {
        console.warn(`      ⚠️ Desc gen failed: ${e.message}`);
    }
    return null;
}

// ------------------------------------------------------------------
// MAIN
// ------------------------------------------------------------------

async function run() {
    console.log('🚀 Starting DAILY Product Pipeline (New Products Only)...');

    // 1. Get products created/updated in last 24h
    // Since we don't strictly track "createdAt" perfectly in all legacy data, 
    // let's rely on "status" == 'active' and maybe limit to 100 recent for now?
    // A better approach for daily is to check specific "needs processing" flags or just scan recent IDs.
    // For simplicity: We scan the latest 100 active products.

    const snapshot = await db.collection(COLLECTION_NAME)
        .where('status', '==', 'active')
        .limit(100) // Daily limit
        .get();

    console.log(`Scanning ${snapshot.size} recent active products for issues...`);

    let processed = 0;
    let updated = 0;

    for (const doc of snapshot.docs) {
        const p = { id: doc.id, ...doc.data() };
        let docUpdates = {};

        console.log(`\n[${processed + 1}] Checking ${p.name_mn || p.name}...`);

        // A. Weight Check
        const weightUpdates = await fixWeight(p);
        if (weightUpdates) {
            console.log(`      ⚖️ Weight Fixed: ${weightUpdates.weight}kg`);
            docUpdates = { ...docUpdates, ...weightUpdates };
            // Update local p object for next steps
            p.weight = weightUpdates.weight;
        }

        // B. Translation Check
        const transUpdates = await fixTranslation(p);
        if (transUpdates) {
            console.log(`      🗣️ Translation Fixed`);
            docUpdates = { ...docUpdates, ...transUpdates };
            // Update local p
            if (transUpdates.name_mn) p.name_mn = transUpdates.name_mn;
        }

        // C. Description Check
        // Only generate if we have a good name (which we might have just fixed)
        const descUpdates = await generateDesc(p);
        if (descUpdates) {
            console.log(`      📝 Description Generated`);
            docUpdates = { ...docUpdates, ...descUpdates };
        }

        // SAVE
        if (Object.keys(docUpdates).length > 0) {
            docUpdates.lastDailyProcessedAt = admin.firestore.FieldValue.serverTimestamp();
            await db.collection(COLLECTION_NAME).doc(p.id).update(docUpdates);
            updated++;
            console.log(`      ✅ SAVED all changes.`);

            // Wait only if we actually used AI (approx check)
            await new Promise(r => setTimeout(r, DELAY_MS));
        } else {
            console.log(`      ✨ Perfect (No changes needed)`);
        }

        processed++;
    }

    console.log(`\n🎉 Daily Pipeline Done! Updated ${updated} products.`);
    process.exit(0);
}

run().catch(console.error);
