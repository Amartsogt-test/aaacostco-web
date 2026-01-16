
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
if (!process.env.GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY is missing in .env");
    process.exit(1);
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: {
        temperature: 0.1, // Keep it deterministic
        responseMimeType: "application/json",
    }
});

// 3. Helper to build prompt context
function getProductText(p) {
    let context = `Name (MN): ${p.name_mn || ''}\n`;
    context += `Name (EN): ${p.englishName || p.name || ''}\n`;

    // Features
    if (p.classifications) {
        context += "Features: ";
        p.classifications.forEach(c => {
            if (c.features) {
                c.features.forEach(f => {
                    context += `${f.name}: ${f.featureValues.map(v => v.value).join(', ')}. `;
                });
            }
        });
        context += "\n";
    }

    // NEW: Specifications (where weight is often hidden)
    if (p.specifications && Array.isArray(p.specifications)) {
        context += "Specifications:\n";
        p.specifications.forEach(s => {
            context += `- ${s.name}: ${s.value}\n`;
        });
    }

    // Description
    if (p.description_en || p.description) {
        context += `Description: ${p.description_en || p.description}\n`;
    }

    return context;
}

// 4. Main Script
async function run() {
    console.log("🚀 Starting AI Weight Fix...");

    // Batch processing config
    // Batch processing config
    const BATCH_SIZE = 50;

    // Fetch ALL products (using stream to avoid memory overflow, but here we can just fetch ID+features)
    // For simplicity and speed in this specific script, let's just fetch all and process in chunks.
    // If 7000 items is too big for variable, we can stream. But ~10MB JSON is fine.
    console.log("Fetching ALL products...");
    const snapshot = await db.collection('products').get();

    let products = [];
    snapshot.forEach(doc => products.push({ id: doc.id, ...doc.data() }));

    let processed = 0;
    let updated = 0;
    let errors = 0;

    console.log(`Loaded ${products.length} products. Processing...`);

    for (let i = 0; i < products.length; i += BATCH_SIZE) {
        const batch = products.slice(i, i + BATCH_SIZE);

        // 5. Regex Fallback Logic (Robust)
        // 5. Regex Fallback Logic (Robust)
        function extractWeightRegex(text) {
            if (!text) return { weightKg: 0, reason: "no text" };

            // Clean text
            const cleanText = text.toLowerCase().replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');

            // Patterns
            const patterns = [
                // Explicit "Weight: 13.9kg" or "Weight 13.9kg"
                /(?:weight|net weight|gross weight|жин)\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(kg|кг|g|г|gr|гр)/i,
            ];

            // Strategy 1: Look for explicit "Weight:" labels
            const labelMatch = cleanText.match(patterns[0]);
            if (labelMatch) {
                let val = parseFloat(labelMatch[1]);
                let unit = labelMatch[2].toLowerCase();
                if (['g', 'г', 'gr', 'гр'].some(u => unit.startsWith(u))) val /= 1000;
                return { weightKg: val, reason: `Regex explicit match: ${labelMatch[0]}` };
            }

            // Strategy 2: Look for all weight-like tokens
            // Removed \b and used lookahead for Cyrillic safety
            const matches = [...cleanText.matchAll(/(\d+(?:\.\d+)?)\s*(kg|кг|g|г|gr|гр|ml|мл)(?=$|\s|[.,])/gi)];

            let candidates = [];
            for (const m of matches) {
                let val = parseFloat(m[1]);
                const unit = m[2].toLowerCase();
                const fullMatch = m[0];
                const matchIndex = m.index;

                // Convert to KG
                if (['g', 'г', 'gr', 'гр', 'ml', 'мл'].some(u => unit.startsWith(u))) val /= 1000;

                // 🚀 CHECK FOR MULTIPLIER (x 6 or * 6)
                const remainder = cleanText.substring(matchIndex + fullMatch.length);
                const multiplierMatch = remainder.match(/^\s*[x*х]\s*(\d+)/i); // 'x', '*', or cyrillic 'х'

                let multiplierReason = "";

                if (multiplierMatch) {
                    const count = parseInt(multiplierMatch[1]);
                    if (count > 0 && count < 100) {
                        multiplierReason = ` (x${count})`;
                        val *= count;
                    }
                } else {
                    // 🚀 CHECK FOR PRE-MULTIPLIER (6 x 340g)
                    const prefix = cleanText.substring(0, matchIndex);
                    const preMultiplierMatch = prefix.match(/(\d+)\s*[x*х]\s*$/i);
                    if (preMultiplierMatch) {
                        const count = parseInt(preMultiplierMatch[1]);
                        if (count > 0 && count < 100) {
                            multiplierReason = ` (${count}x)`;
                            val *= count;
                        }
                    }
                }

                // Filter valid range (0.01kg to 500kg)
                if (val > 0.01 && val < 500) {
                    candidates.push({ val, match: fullMatch + multiplierReason });
                }
            }

            if (candidates.length > 0) {
                candidates.sort((a, b) => b.val - a.val);
                const best = candidates[0];
                return { weightKg: best.val, reason: `Regex found candidate: ${best.match}` };
            }

            return { weightKg: 0, reason: "no valid weight pattern found" };
        }

        // 5.5 AI Helper
        async function askGeminiWeight(product, textContext) {
            try {
                const prompt = `
                Product: ${product.name_mn || ''} / ${product.name || ''}
                Brand: ${product.brand || ''}
                Model: ${product.model || ''}
                
                Context from DB:
                ${textContext}
                
                Task: Estimate the shipping weight of this product in KG.
                
                Rules:
                1. If exact weight is in the text, use it.
                2. If not, use your knowledge base to find the typical weight for this specific product model.
                3. If it is a multipack (e.g. 12 bottles of 500ml), calculate the total weight (e.g. 6kg) + packaging.
                4. Be conservative. If unsure, estimate based on similar products.
                
                Output JSON ONLY:
                {
                  "weightKg": number (e.g. 1.5, 0.5),
                  "confidence": "high" | "medium" | "low",
                  "source": "text_analysis" | "knowledge_base",
                  "reason": "Short explanation"
                }
                `;

                const result = await model.generateContent(prompt);
                const response = result.response;
                const jsonText = response.text().replace(/```json/g, '').replace(/```/g, '').trim();
                const data = JSON.parse(jsonText);

                return data;
            } catch (e) {
                return { weightKg: 0, error: e.message };
            }
        }

        // 4. Main Script
        // (Merged Logic)
        await Promise.all(batch.map(async (p) => {
            try {
                // Generate Rich Context
                const text = getProductText(p);

                // Use Regex first (Fast, Free, Accurate for explicit text)
                let result = extractWeightRegex(text);

                // If Regex failed (0kg), try AI (Knowledge Base)
                if (result.weightKg === 0) {
                    // Only use AI for items that actually need it (skip if we already have a manual override? No, script checks all)
                    process.stdout.write(`🤖 AI Searching for ${p.id}... `);
                    const aiResult = await askGeminiWeight(p, text);

                    if (aiResult.weightKg > 0 && aiResult.confidence !== 'low') {
                        result = {
                            weightKg: aiResult.weightKg,
                            reason: `AI (${aiResult.source}): ${aiResult.reason}`
                        };
                    } else {
                        process.stdout.write(`AI found nothing/low confidence. `);
                    }
                }

                if (result.weightKg > 0) {
                    if (p.id === '1638376') {
                        console.log(`!!! SPECIAL DEBUG: Updating 1638376 to ${result.weightKg}kg (Reason: ${result.reason}) !!!`);
                    }
                    process.stdout.write(`✅ ${p.id.padEnd(10)}: ${result.weightKg}kg (${result.reason})\n`);

                    // Update Firestore
                    // Set both aiWeight (traceability) and weight (active use)
                    await db.collection('products').doc(p.id).update({
                        aiWeight: result.weightKg,
                        aiWeight: result.weightKg,
                        aiWeightReason: result.reason,
                        weight: result.weightKg, // APPLY DIRECTLY
                        updatedAt: new Date().toISOString()
                    });
                    updated++;
                } else {
                    // If previously set by AI but now 0 (logic correction), reset it
                    if (p.aiWeight > 0 || (p.weight > 0 && p.aiWeightReason)) {
                        process.stdout.write(`⚠️ Resetting ${p.id} to 0kg (prev: ${p.weight}kg)\n`);
                        await db.collection('products').doc(p.id).update({
                            aiWeight: 0,
                            aiWeightReason: "Regex returned 0 (correction)",
                            weight: 0,
                            updatedAt: new Date().toISOString()
                        });
                        updated++;
                    } else {
                        process.stdout.write(`Pass ${p.id} (0kg)\n`);
                    }
                }
            } catch (err) {
                process.stdout.write(`❌ Error ${p.id}: ${err.message}\n`);
                errors++;
            }
        }));

        processed += batch.length;
        if (processed % 100 === 0) console.log(`--- Processed ${processed}/${products.length} ---`);

        // Rate limit safety buffer
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`\n🎉 Done! Updated: ${updated}, Errors: ${errors}`);
}

run().catch(console.error);
