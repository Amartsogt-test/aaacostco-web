
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

// 1. Config
const API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
const SERVICE_ACCOUNT_PATH = path.join(__dirname, '../functions/service-account.json');
const COLLECTION_NAME = 'products';
// Use exp model or fallback
const MODEL_NAME = 'gemini-2.0-flash';
const FALLBACK_MODEL = 'gemini-1.5-flash';

// Slow down significantly to handle quota exhaustion
const BATCH_LIMIT = 10000;
const DELAY_MS = 5000; // 5 seconds per item

// 2. Initialize Firebase
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

// 3. Initialize Gemini
const genAI = new GoogleGenerativeAI(API_KEY);

async function generateSummary(product) {
    const productContext = `
        Name (MN): ${product.name_mn || product.name || ''}
        Name (EN): ${product.englishName || ''}
        Brand: ${product.brand || ''}
        Price: ${product.price || ''}
        Description (MN): ${(product.description_mn || '').substring(0, 500)}
        Description (EN): ${(product.description_en || product.description || '').substring(0, 500)}
    `;

    const prompt = `
        You are a helpful Costco Personal Shopper.
        Write a ONE SENTENCE summary of this product in MONGOLIAN (Ulaanbaatar dialect).
        
        PRODUCT INFO:
        ${productContext}

        REQUIREMENTS:
        - Max 20-30 words.
        - Focus on what it is and its main benefit.
        - Tone: Friendly and helpful.
        - Output PLAIN TEXT only. No markdown.
        
        Example:
        "Энэ бол Kirkland брэндийн 2 литрийн органик оливийн тос бөгөөд хоол хүнсэнд хэрэглэхэд нэн тохиромжтой."
    `;

    // Robust AI Call with Infinite Retry
    async function callModel(promptText, modelName) {
        const model = genAI.getGenerativeModel({ model: modelName });

        while (true) {
            try {
                const result = await model.generateContent(promptText);
                const response = await result.response;
                return response.text().trim();
            } catch (error) {
                if (error.message.includes('429') || error.message.includes('503')) {
                    console.log(`      ⏳ Quota hit (${modelName}). Waiting 60s...`);
                    await new Promise(r => setTimeout(r, 60000)); // Wait 1 minute
                } else {
                    console.error(`      ❌ AI Fatal Error: ${error.message}`);
                    throw error;
                }
            }
        }
    }

    try {
        return await callModel(prompt, MODEL_NAME);
    } catch (error) {
        console.warn(`   ⚠️ Primary model (${MODEL_NAME}) failed: ${error.message}`);
        try {
            console.log(`   🔄 Trying fallback (${FALLBACK_MODEL})...`);
            return await callModel(FALLBACK_MODEL);
        } catch (fallbackError) {
            console.error(`   ❌ All AI models failed for ${product.id}`);
            return null;
        }
    }
}

async function run() {
    console.log('🚀 Starting Batch Description Generator (Robust Mode)...');

    console.log('Fetching products...');
    const snapshot = await db.collection(COLLECTION_NAME)
        .where('status', '==', 'active')
        .get();

    console.log(`Found ${snapshot.size} active products.`);

    let processedCount = 0;
    let updatedCount = 0;

    for (const doc of snapshot.docs) {
        if (processedCount >= BATCH_LIMIT) {
            console.log(`Reached batch limit of ${BATCH_LIMIT}. Stopping.`);
            break;
        }

        const product = { id: doc.id, ...doc.data() };

        // Skip if already has description (and it's decently long)
        if (product.shortDescription && product.shortDescription.length > 10) {
            continue;
        }

        // Skip known failed ones
        if (product.aiDescriptionStatus === 'failed') {
            continue;
        }

        console.log(`[${processedCount + 1}] Processing: ${product.name_mn || product.name}...`);

        const summary = await generateSummary(product);

        if (summary) {
            console.log(`   📝 Summary: ${summary}`);
            await db.collection(COLLECTION_NAME).doc(doc.id).update({
                shortDescription: summary,
                aiDescriptionStatus: 'fixed',
                shortDescriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            updatedCount++;
            console.log('   ✅ Saved.');
        } else {
            console.log('   ❌ Skipped (AI failed). Marking for review.');
            await db.collection(COLLECTION_NAME).doc(doc.id).update({
                aiDescriptionStatus: 'failed',
                shortDescriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        processedCount++;

        // Delay to avoid 429
        if (DELAY_MS > 0) {
            await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }
    }

    console.log(`\n🎉 Done! Processed: ${processedCount}, Updated: ${updatedCount}`);
    process.exit(0);
}

run().catch(err => {
    console.error('Fatal Error:', err);
    process.exit(1);
});
