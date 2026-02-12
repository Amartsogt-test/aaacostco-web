
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

// Rate Limiting
const BATCH_LIMIT = 10000;
const DELAY_MS = 5000; // 5 seconds

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

// 3. Logic Helpers
function detectIssue(product) {
    // SKIP if already processed by AI/Manual fix to avoid infinite retries
    if (product.weightFixedAt || product.aiWeightStatus === 'unfixable') return null;

    const name = (product.name_mn || product.englishName || product.name || '').toLowerCase();
    const currentWeight = product.weight || 0;

    // CASE 1: Missing
    if (!currentWeight || currentWeight === 0) return "missing_weight";

    // CASE 2: Suspiciously low for multipack (e.g. "x 6" but weight is < 0.5kg)
    const multiplierMatch = name.match(/(?:x|×|х|ху|[\s])\s*(\d{1,3})\s*(?:ea|ш|шт|개|pack|bags|packs|pcs|pk|p)/i);
    if (multiplierMatch) {
        if (currentWeight < 0.8 && parseFloat(multiplierMatch[1]) > 2) return "multipack_underestimated";
    }

    // CASE 3: Dimension Confusion (e.g. 50cm -> 50kg)
    const dimensionMatch = name.match(/(\d+(?:\.\d+)?)\s*(?:cm|mm|м|m|и|inch|인치|size)/i);
    if (dimensionMatch) {
        const dimVal = parseFloat(dimensionMatch[1]);
        if (Math.abs(currentWeight - dimVal) < 0.05 && currentWeight > 1) return "dimension_confusion";
    }

    return null; // OK
}

// Robust AI Call with Infinite Retry (Time is not an issue)
async function callAI(prompt, modelId = 'gemini-2.0-flash') {
    const m = genAI.getGenerativeModel({
        model: modelId,
        generationConfig: { responseMimeType: "application/json" }
    });

    while (true) {
        try {
            const result = await m.generateContent(prompt);
            return result.response.text();
        } catch (error) {
            if (error.message.includes('429') || error.message.includes('503')) {
                console.log(`      ⏳ Quota hit (${modelId}). Waiting 60s...`);
                await new Promise(r => setTimeout(r, 60000)); // Wait 1 minute
                // Loop continues automatically
            } else {
                console.error(`      ❌ AI Fatal Error: ${error.message}`);
                throw error; // Fatal error (e.g. invalid key, safety)
            }
        }
    }
}

async function run() {
    console.log('🚀 Starting Weight Fix Script...');

    // Fetch all for audit
    console.log("Fetching products from Firestore...");
    const snapshot = await db.collection(COLLECTION_NAME).get();
    console.log(`Fetched ${snapshot.size} products. Auditing issues...`);
    const targets = [];

    snapshot.forEach(doc => {
        const p = doc.data();
        const issue = detectIssue(p);
        if (issue) {
            targets.push({ id: doc.id, issue, ...p });
        }
    });

    console.log(`Found ${targets.length} products with weight issues.`);

    let processed = 0;
    let saved = 0;

    for (const p of targets) {
        if (processed >= BATCH_LIMIT) break;

        console.log(`[${processed + 1}] Fixing ${p.id} (${p.issue})...`);
        const context = `
            Name (MN): ${p.name_mn || ''}
            Name (EN): ${p.englishName || p.name || ''}
            Specs: ${JSON.stringify(p.specifications || p.specifications_mn || [])}
            Desc: ${(p.description_mn || '').substring(0, 300)}
        `;

        const prompt = `
            Analyze this Costco product            Calculate TOTAL shipping weight (kg) for: ${context}.
            RULES:
            1. PRIORITY: Check 'Specs'/'specifications' FIRST. If weight is listed, use it.
            2. MULTIPACK: If "x 12", "Pack of 4", calculate TOTAL weight (Unit Weight * Count).
            3. DIMENSIONS: Ignore Length/Width/Height (cm, mm, in). Do NOT confuse '50cm' with '50kg'.
            4. ESTIMATE: If strictly unknown, estimate based on item type (e.g. Detergent ~3-5kg).
            
            INFO: ${context}
            
            Return JSON: {"weightKg": number, "reason": "string"}
        `;

        try {
            const res = await callAI(prompt);
            const data = JSON.parse(res.replace(/```json|```/g, '').trim());

            if (data.weightKg > 0) {
                // Update
                const newWeight = data.weightKg;
                console.log(`      ✅ New Weight: ${newWeight}kg (Reason: ${data.reason})`);

                await db.collection(COLLECTION_NAME).doc(p.id).update({
                    weight: newWeight,
                    aiWeight: newWeight,
                    aiWeightReason: `AI Fix: ${data.reason}`,
                    aiWeightStatus: 'fixed',
                    weightFixedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                saved++;
            } else {
                console.log('      ⚠️ AI returned 0 weight. Marking as skipped/processed.');
                await db.collection(COLLECTION_NAME).doc(p.id).update({
                    aiWeightStatus: 'unfixable',
                    aiWeightReason: 'AI could not determine weight',
                    weightFixedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }

        } catch (e) {
            console.error(`      ❌ Failed: ${e.message}`);
        }

        processed++;
        await new Promise(r => setTimeout(r, DELAY_MS));
    }

    console.log(`Done. Processed: ${processed}, Updated: ${saved}`);
    process.exit(0);
}

run().catch(console.error);
