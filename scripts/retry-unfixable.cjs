const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');

// 1. Config
const envLocalPath = path.resolve(__dirname, '../.env.local');
dotenv.config({ path: envLocalPath });

const API_KEY = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
const SERVICE_ACCOUNT_PATH = path.join(__dirname, '../functions/service-account.json');
const COLLECTION_NAME = 'products';
const MODEL_NAME = 'gemini-2.0-flash';
const DELAY_MS = 2000; // 2s delay

if (!API_KEY) {
    console.error('❌ API Key not found!');
    process.exit(1);
}

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
async function callAI(prompt) {
    const m = genAI.getGenerativeModel({
        model: MODEL_NAME,
        generationConfig: { responseMimeType: "application/json" }
    });
    try {
        const result = await m.generateContent(prompt);
        return result.response.text();
    } catch (error) {
        if (error.message.includes('429')) {
            console.log(`      ⏳ Quota hit. Waiting 30s...`);
            await new Promise(r => setTimeout(r, 30000));
            return callAI(prompt); // Retry
        }
        throw error;
    }
}

// ------------------------------------------------------------------
// MAIN
// ------------------------------------------------------------------

async function run() {
    console.log('🚀 Starting LEVEL 2 RETRY (Aggressive Estimation)...');

    // 1. Find "Unfixable" products
    const snapshot = await db.collection(COLLECTION_NAME)
        .where('aiWeightStatus', '==', 'unfixable')
        .get();

    if (snapshot.empty) {
        console.log('✅ No unfixable items found. Everything is good!');
        process.exit(0);
    }

    console.log(`Found ${snapshot.size} items to RETRY.`);

    let processed = 0;
    let saved = 0;

    for (const doc of snapshot.docs) {
        const p = { id: doc.id, ...doc.data() };
        console.log(`[${processed + 1}/${snapshot.size}] Retrying ${p.id} (${p.name})...`);

        const context = `
            Name: ${p.name_mn || p.name}
            Desc: ${(p.description_mn || p.description || '').substring(0, 500)}
            Category: ${p.category}
        `;

        // Aggressive Prompt
        const prompt = `
            Estimate the shipping weight (kg) for this product on a Costco shelf.
            INFO: ${context}

            CRITICAL RULES:
            1. PRIORITY: Check 'Specs'/'specifications' FIRST. If weight is listed, use it.
            2. MULTIPACK: If "x 12", "Pack of 4", calculate TOTAL weight (Unit Weight * Count).
            3. DIMENSIONS: Ignore Length/Width/Height (cm, mm, in). Do NOT confuse '50cm' with '50kg'.
            4. MISSING? Make a BEST GUESS based on prod type (Snacks~0.5kg, Candy~1.5kg, Machines~5kg).
            3. Candy Bags -> ~1.5kg
            4. Clothing -> ~0.5kg
            5. Supplements -> ~0.3kg
            6. Liquids -> 1L = 1kg
            
            DO NOT RETURN 0. GIVE ME YOUR BEST ESTIMATE.
            Return JSON: {"weightKg": number, "reason": "string"}
        `;

        try {
            const res = await callAI(prompt);
            const data = JSON.parse(res.replace(/```json|```/g, '').trim());

            if (data.weightKg > 0) {
                console.log(`      ✅ ESTIMATED: ${data.weightKg}kg (${data.reason})`);

                await db.collection(COLLECTION_NAME).doc(p.id).update({
                    weight: data.weightKg,
                    aiWeight: data.weightKg,
                    aiWeightReason: `AI Retry Estimate: ${data.reason}`,
                    aiWeightStatus: 'fixed_retry', // New status for tracked retries
                    weightFixedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                saved++;
            } else {
                console.log('      ❌ Still 0. Giving up completely.');
                // Optional: Mark as 'manual_required' so we don't even retry this script?
                // For now, leave as unfixable or maybe 'failed_final'
            }

        } catch (e) {
            console.error(`      ⚠️ Retry failed: ${e.message}`);
        }

        processed++;
        await new Promise(r => setTimeout(r, DELAY_MS));
    }

    console.log(`\n🎉 Retry Complete! Fixed ${saved}/${processed} items.`);
}

run().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
