
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serviceAccountPath = path.join(__dirname, '../functions/service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

function getProductText(p) {
    let context = `Name (MN): ${p.name_mn || ''}\n`;
    context += `Name (EN): ${p.englishName || p.name || ''}\n`;

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

    if (p.specifications && Array.isArray(p.specifications)) {
        context += "Specifications:\n";
        p.specifications.forEach(s => {
            context += `- ${s.name}: ${s.value}\n`;
        });
    }

    if (p.description_en || p.description) {
        context += `Description: ${p.description_en || p.description}\n`;
    }

    return context;
}

function extractWeightRegex(text) {
    if (!text) return { weightKg: 0, reason: "no text" };

    const cleanText = text.toLowerCase().replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');

    console.log("Clean Text Preview:", cleanText);

    // Matches from fix-weights.js
    // Removed 'l' and 'л'
    const matches = [...cleanText.matchAll(/(\d+(?:\.\d+)?)\s*(kg|кг|g|г|gr|гр|ml|мл)(?=$|\s|[.,])/gi)];

    let candidates = [];
    for (const m of matches) {
        let val = parseFloat(m[1]);
        const unit = m[2].toLowerCase();
        const fullMatch = m[0];
        console.log(`Match found: ${fullMatch} (Val: ${val}, Unit: ${unit})`);

        if (['g', 'г', 'gr', 'гр', 'ml', 'мл'].some(u => unit.startsWith(u))) val /= 1000;

        // Multiplier logic (simplified for debug view)
        candidates.push({ val, match: fullMatch });
    }

    if (candidates.length > 0) {
        candidates.sort((a, b) => b.val - a.val);
        return { weightKg: candidates[0].val, reason: `Found: ${candidates[0].match}` };
    }
    return { weightKg: 0, reason: "No match" };
}

async function run() {
    const doc = await db.collection('products').doc('1872099').get();
    if (!doc.exists) {
        console.log("Product not found");
        return;
    }
    const p = { id: doc.id, ...doc.data() };
    const text = getProductText(p);
    console.log("------ PRODUCT TEXT ------");
    console.log(text);
    console.log("--------------------------");

    const result = extractWeightRegex(text);
    console.log("Result:", result);
}

run();
