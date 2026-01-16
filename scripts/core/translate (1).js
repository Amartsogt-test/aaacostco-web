
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serviceAccountPath = path.join(__dirname, '../../functions/service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

try {
    initializeApp({ credential: cert(serviceAccount) });
} catch (e) {
    if (e.code !== 'app/already-exists') throw e;
}

const db = getFirestore();

// Gemini API Configuration
const API_KEY = 'AIzaSyCEuiBNYCdG10TxmQSq6ipI_uanY2f1tuc';
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
function stripHtml(html) {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 2000);
}

async function translateAll() {
    console.log("🚀 Starting Full Translation (name, description, specifications)...");

    const snapshot = await db.collection('products').get();
    const productsToProcess = [];

    snapshot.forEach(doc => {
        const data = doc.data();
        const needsName = !data.name_mn || data.name_mn === data.name;
        const needsDesc = !data.description_mn && data.description;
        const needsSpecs = !data.specifications_mn && data.specifications && data.specifications.length > 0;

        if (needsName || needsDesc || needsSpecs) {
            productsToProcess.push({
                id: doc.id,
                name: data.name,
                description: data.description,
                specifications: data.specifications,
                needsName,
                needsDesc,
                needsSpecs
            });
        }
    });

    console.log(`Found ${productsToProcess.length} products needing translation.`);

    if (productsToProcess.length === 0) {
        console.log("All products are already translated.");
        return;
    }

    // Process in batches to speed up
    const BATCH_SIZE = 5;
    for (let i = 0; i < productsToProcess.length; i += BATCH_SIZE) {
        const batch = productsToProcess.slice(i, i + BATCH_SIZE);
        console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(productsToProcess.length / BATCH_SIZE)}...`);

        await Promise.all(batch.map(async (product, idx) => {
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

        // Small delay between batches to avoid rate limits
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log("✅ Translation complete!");
}

translateAll();
