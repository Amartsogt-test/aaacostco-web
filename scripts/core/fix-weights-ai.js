/**
 * AI-Only Weight Recalculation Script - Global Audit Version
 * 
 * This script identifies products with potentially incorrect weights
 * and uses Gemini 3 AI to recalculate the correct total weight.
 * 
 * Usage: 
 *   node scripts/core/fix-weights-ai.js [productId]  (Target specific product)
 *   node scripts/core/fix-weights-ai.js --all        (Audit ALL products)
 *   node scripts/core/fix-weights-ai.js --auto       (Audit products with issues - default)
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();
dotenv.config({ path: path.join(__dirname, '../../.env.local') });

// 1. Firebase Setup
const serviceAccountPath = path.join(__dirname, '../../functions/service-account.json');
if (!fs.existsSync(serviceAccountPath)) {
    console.error(`❌ Service account file not found at: ${serviceAccountPath}`);
    process.exit(1);
}
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// 2. Gemini Setup
const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
if (!apiKey) {
    console.error("❌ GEMINI_API_KEY or VITE_GEMINI_API_KEY is missing in .env");
    process.exit(1);
}
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
    }
});

// 3. Get product context for AI
function getProductContext(p) {
    let context = `ID: ${p.id}\n`;
    context += `Name (MN): ${p.name_mn || ''}\n`;
    context += `Name (EN): ${p.englishName || p.name || ''}\n`;
    context += `Brand: ${p.brand || ''}\n`;

    if (p.specifications && Array.isArray(p.specifications)) {
        context += "Specifications:\n";
        p.specifications.forEach(s => {
            context += `- ${s.name}: ${s.value}\n`;
        });
    }

    if (p.description_mn) {
        context += `Description (MN): ${(p.description_mn || '').substring(0, 500)}\n`;
    }
    if (p.description_en || p.description) {
        context += `Description (EN): ${(p.description_en || p.description || '').substring(0, 500)}\n`;
    }

    return context;
}

// 4. AI Weight Calculation
async function calculateWeightWithAI(product, context) {
    try {
        const prompt = `
You are a product logistics expert for a retail store (Costco). 
Analyze this product and calculate its EXACT TOTAL shipping weight in Kilograms (kg).

Product Information:
${context}

CRITICAL RULES FOR CALCULATION:

1. PRIORITIZE SPECIFICATIONS: 
   Check the "Specifications" list FIRST. Look for fields like "Жин", "Weight", "Net Weight", "Gross Weight", "Net Content", "Capacity".
   If a specific weight value is listed there (e.g., "3.5kg"), use it as the source of truth, but apply rule #2 if it's a multipack.

2. MULTIPACKS ARE VITAL: 
   If names include "x 2", "x 40", "x 12", "x 6", "12ea", "24pcs", etc., you MUST multiply the unit weight by that quantity.
   - Example: "340g x 6" -> (0.34 * 6) = 2.04kg
   - Example: "2.83L x 2" -> (2.83 * 2) = 5.66kg
   - Example: "(25g x 2) x 40EA" -> (0.025 * 2 * 40) = 2.0kg
   DO NOT give the weight of just 1 item if it's a bulk/multipack.

3. IGNORE DIMENSIONS: 
   "74cm x 74cm", "size 32", "diameter 50cm", "120mm" are NOT weights. 
   Many products have dimensions confused for weights (e.g., a 50cm umbrella listed as 50kg). 
   NEVER mistake a dimension for weight.

4. PRODUCT TYPE CONVERSION:
   - Liquids (ml, L, liter, 리터, мл, л): 1 liter = 1kg.
   - Solids/Powders (g, kg, гр, кг, 킬로그램): Direct weight.
   - For light/bulky items like toilet paper or paper towels, use the weight listed in specs or your best estimate for a large pack (~5-10kg).

 6. WAREHOUSE PRICE ESTIMATION (Online markup vs Store price):
    Costco Online prices often include a shipping markup (배송비). 
    However, NOT all products are cheaper in-store. 
    Estimate the "Shipping Markup" (배송비) in KRW:
    - Electronics, Laptops, Mobile, Luxury Watches, High-end Appliances: Usually 0 KRW markup (Online Price = Store Price).
    - Heavy/Bulky Food, Water, Detergent, Large Packs (>5kg): Usually 3,000 - 5,000 KRW markup.
    - Standard Grocery/Daily Essentials: Usually 2,000 KRW markup.
    - If the product is already marked as "Sale/Discounted" online, the markup might be 0.
    - If unsure if it's cheaper in-store: Use 0 KRW (Safer to assume no discount).

Respond with JSON ONLY:
{
  "weightKg": number (the TOTAL weight in kg),
  "confidence": "high" | "medium" | "low",
  "calculation": "explanation in Mongolian",
  "isMultipack": boolean,
  "estimatedMarkupKrw": number
}
`;

        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const jsonText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const data = JSON.parse(jsonText);

        return data;
    } catch (e) {
        console.error(`AI Error for ${product.id}: ${e.message}`);
        return { weightKg: 0, error: e.message };
    }
}

// 5. Detect potentially incorrect weights
function detectIssue(product) {
    const name = (product.name_mn || product.englishName || product.name || '').toLowerCase();
    const currentWeight = product.weight || 0;
    const specs = JSON.stringify(product.specifications || product.classifications || []).toLowerCase();

    // 🚀 Check for multiplier patterns (x 6, × 12, х 2, 40ea, pack of, etc)
    const multiplierMatch = name.match(/(?:x|×|х|ху|[\s])\s*(\d{1,3})\s*(?:ea|ш|шт|개|pack|bags|packs|pcs|pk|p)/i);
    const hasMultiplier = !!multiplierMatch;

    // 🚀 CASE 1: Has multiplier but weight is suspicious (< 0.8kg for bulk)
    if (hasMultiplier && currentWeight < 0.8) {
        return "multipack_underestimated";
    }

    // 🚀 CASE 2: Weight matches a dimension (e.g., 50cm -> 50kg)
    const dimensionMatch = name.match(/(\d+(?:\.\d+)?)\s*(?:cm|mm|м|m|и|inch|인치|size)/i);
    if (dimensionMatch) {
        const dimVal = parseFloat(dimensionMatch[1]);
        if (Math.abs(currentWeight - dimVal) < 0.05 && currentWeight > 1) {
            return "dimension_confusion";
        }
    }

    // 🚀 CASE 3: Weight is too low for liquids
    const volMatch = name.match(/(\d+(?:\.\d+)?)\s*(l|л|리터|liter)/i);
    if (volMatch) {
        const liters = parseFloat(volMatch[1]);
        if (liters >= 1 && currentWeight < (liters * 0.5)) return "liquid_underestimated";
    }

    // 🚀 CASE 4: Missing weight
    if (!currentWeight || currentWeight === 0) {
        return "missing_weight";
    }

    // 🚀 CASE 5: Weight in Specs but not in field
    const weightInSpecs = specs.includes('kg') || specs.includes('жин') || specs.includes(' weight');
    if (weightInSpecs && (!currentWeight || currentWeight < 0.1)) {
        return "specs_data_missing";
    }

    return null;
}

// 6. Main Script
async function run() {
    console.log("🧠 Starting AI Weight Recalculation Global Audit...\n");

    const mode = process.argv[2]; // --all, --auto, or [productId]

    const BATCH_SIZE = 5;
    const DELAY_MS = 1500;

    let productsToAudit = [];

    if (mode === '--all') {
        console.log("🔍 MODE: Global Audit (All Products)");
        const snapshot = await db.collection('products').get();
        snapshot.forEach(doc => productsToAudit.push({ id: doc.id, ...doc.data() }));
    } else if (mode && mode.startsWith('--') === false) {
        console.log(`🔍 MODE: Single Product (${mode})`);
        const doc = await db.collection('products').doc(mode).get();
        if (doc.exists) {
            productsToAudit = [{ id: doc.id, ...doc.data() }];
        } else {
            console.error("❌ Product not found");
            return;
        }
    } else {
        console.log("🔍 MODE: Auto-Detect (New Products Only)");
        // Optimization: Only fetch products where weight is 0 or missing
        // This assumes new products are initialized with 0 weight
        const snapshot = await db.collection('products').where('weight', '==', 0).get();
        snapshot.forEach(doc => {
            // Second check: Ensure it's not already AI processed (double safety)
            const d = doc.data();
            if (!d.aiWeight) {
                productsToAudit.push({ id: doc.id, ...d });
            }
        });

        // Also check for null weight if possible, but 0 is standard init
        // If we want to catch nulls:
        // const snapNull = await db.collection('products').where('weight', '==', null).get(); ...
    }

    console.log(`📊 Audit Scope: ${productsToAudit.length} new products.\n`);

    if (productsToAudit.length === 0) {
        console.log("✅ No products found for audit. Exiting.");
        return;
    }

    let updated = 0;
    let errors = 0;
    let skipped = 0;

    for (let i = 0; i < productsToAudit.length; i += BATCH_SIZE) {
        const batch = productsToAudit.slice(i, i + BATCH_SIZE);

        console.log(`\n--- Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(productsToAudit.length / BATCH_SIZE)} ---`);

        for (const product of batch) {
            try {
                const issue = detectIssue(product);
                const context = getProductContext(product);

                process.stdout.write(`Processing ${product.id} [${issue || 'audit'}]... `);

                const aiResult = await calculateWeightWithAI(product, context);

                if (aiResult.weightKg > 0) {
                    const oldWeight = product.weight || 0;
                    const newWeight = Math.round(aiResult.weightKg * 100) / 100;

                    // Update if significantly different or if it was missing/ai-calculated
                    const isSignificantWeightChange = Math.abs(newWeight - oldWeight) > 0.05;
                    const isFixingMissingWeight = oldWeight === 0;
                    const isCleaningDimension = issue === "dimension_confusion";

                    const onlinePrice = product.priceKRW || product.originalPrice || 0;
                    const markup = aiResult.estimatedMarkupKrw || 0;
                    const newWarehousePrice = onlinePrice > markup ? onlinePrice - markup : onlinePrice;
                    const oldWarehousePrice = product.estimatedWarehousePrice || 0;

                    // Trigger update if weight changes OR price logic results in a different warehouse price
                    const isPriceChange = Math.abs(newWarehousePrice - oldWarehousePrice) > 10;

                    if (isSignificantWeightChange || isFixingMissingWeight || isCleaningDimension || isPriceChange) {
                        await db.collection('products').doc(product.id).update({
                            weight: newWeight,
                            aiWeight: newWeight,
                            aiWeightReason: `AI (${aiResult.confidence}): ${aiResult.calculation}`,
                            estimatedMarkupKrw: markup,
                            estimatedWarehousePrice: newWarehousePrice,
                            updatedAt: new Date().toISOString()
                        });

                        console.log(`✅ ${oldWeight}kg → ${newWeight}kg (Store Price: ${oldWarehousePrice}₩ → ${newWarehousePrice}₩)`);
                        updated++;
                    } else {
                        console.log(`⏭️ No change`);
                        skipped++;
                    }
                } else {
                    console.log(`⚠️ AI Error: ${aiResult.error || 'low confidence'}`);
                    skipped++;
                }
            } catch (err) {
                console.log(`❌ Error: ${err.message}`);
                errors++;
            }
        }

        if (i + BATCH_SIZE < productsToAudit.length) {
            await new Promise(r => setTimeout(r, DELAY_MS));
        }
    }

    console.log(`\n🎉 Audit Complete!`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Errors: ${errors}`);
}

run().catch(console.error);
