
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
dotenv.config({ path: path.join(__dirname, '../../.env.local') });

let serviceAccount;
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, '../../functions/service-account.json');

try {
    if (fs.existsSync(serviceAccountPath)) {
        serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    } else {
        console.error("❌ No service account found.");
        process.exit(1);
    }

    if (!getApps().length) {
        initializeApp({ credential: cert(serviceAccount) });
    }
} catch (err) {
    console.error("❌ Failed to initialize Firebase:", err.message);
    process.exit(1);
}


const db = getFirestore();

// Gemini API Configuration
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
    console.error("❌ GEMINI_API_KEY is missing in .env");
    process.exit(1);
}
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;

async function callGemini(prompt) {
    const requestBody = JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
    });

    return new Promise((resolve, reject) => {
        const req = https.request(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(requestBody)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (response.candidates && response.candidates[0].content) {
                        resolve(response.candidates[0].content.parts[0].text);
                    } else {
                        reject(new Error('Invalid API response: ' + JSON.stringify(response)));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.write(requestBody);
        req.end();
    });
}

// Strip HTML tags for translation, keep structure
function _stripHtml(html) {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 2000);
}

async function translateAll() {
    console.log("🚀 Starting Optimized Translation (New Products Only)...");

    // Strategy: Fetch only products that likely need translation
    // 1. Where name_mn is missing (null)
    const candidates = [];
    const seenIds = new Set();
    const productsToProcess = [];

    try {
        console.log("   Querying products with name_mn == null...");
        // Fetch up to 100 new/untranslated items per run to avoid timeouts/limits
        const q1 = db.collection('products').where('name_mn', '==', null).limit(100);
        const snap1 = await q1.get();

        snap1.forEach(doc => {
            if (!seenIds.has(doc.id)) {
                seenIds.add(doc.id);
                candidates.push({ id: doc.id, ...doc.data() });
            }
        });

        // Optional: Can verify empty strings too if we suspect bad data, 
        // but typically null is the default for new items.

    } catch (error) {
        console.error("Error querying new products:", error);
    }

    // Validate candidates to determine strictly what needs doing
    candidates.forEach(data => {
        const needsName = !data.name_mn || data.name_mn === data.name;
        const needsDesc = !data.description_mn && data.description;
        const needsSpecs = !data.specifications_mn && data.specifications && data.specifications.length > 0;

        if (needsName || needsDesc || needsSpecs) {
            productsToProcess.push({
                id: data.id,
                name: data.name,
                description: data.description,
                specifications: data.specifications,
                needsName,
                needsDesc,
                needsSpecs
            });
        }
    });

    console.log(`Found ${productsToProcess.length} new products needing translation.`);

    if (productsToProcess.length === 0) {
        console.log("✅ No new products to translate.");
        return;
    }

    // Process in batches
    const BATCH_SIZE = 5;
    for (let i = 0; i < productsToProcess.length; i += BATCH_SIZE) {
        const batch = productsToProcess.slice(i, i + BATCH_SIZE);
        console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(productsToProcess.length / BATCH_SIZE)}...`);

        await Promise.all(batch.map(async (product) => {
            const updates = {};
            try {
                // 1. Translate Name
                if (product.needsName && product.name) {
                    const namePrompt = `Translate the following Korean product name to Mongolian. Return ONLY the translated text, no quotes or explanations. If there are English words, keep them as is: ${product.name}`;
                    const translatedName = await callGemini(namePrompt);
                    updates.name_mn = translatedName.trim();
                }

                // 2. Translate Description
                if (product.needsDesc && product.description) {
                    const descPrompt = `Translate the following Korean product description (HTML) to Mongolian. Preserve ALL HTML tags and <img> tags. Return ONLY the translated HTML:\n\n${product.description.substring(0, 5000)}`;
                    const translatedDesc = await callGemini(descPrompt);
                    updates.description_mn = translatedDesc.replace(/^```html\n|```$/g, '').trim();
                }

                // 3. Translate Specifications
                if (product.needsSpecs && product.specifications && product.specifications.length > 0) {
                    const specsStr = product.specifications.map(s => `${s.name}: ${s.value}`).join('\n');
                    const specsPrompt = `Translate the following Korean product specifications to Mongolian. Return a JSON array with objects {name, value}. Do not include markdown formatting. Translate both names and values into Mongolian:\n\n${specsStr}`;
                    const specsResponse = await callGemini(specsPrompt);
                    const cleanJson = specsResponse.replace(/```json/g, '').replace(/```/g, '').trim();
                    updates.specifications_mn = JSON.parse(cleanJson);
                }

                if (Object.keys(updates).length > 0) {
                    updates.updatedAt = new Date().toISOString();
                    await db.collection('products').doc(product.id).update(updates);
                    console.log(`  ✅ ${product.id} translated`);
                }
            } catch (error) {
                console.error(`  ❌ ${product.id} error: ${error.message}`);
            }
        }));

        await new Promise(r => setTimeout(r, 1000));
    }

    console.log("✅ Translation complete!");
}

translateAll();
