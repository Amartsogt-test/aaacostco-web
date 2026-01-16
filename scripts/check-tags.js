
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Correct Path Resolution
const serviceAccountPath = path.resolve(__dirname, '../functions/service-account.json');
if (!fs.existsSync(serviceAccountPath)) {
    const fallback = 'e:\\Google Drive\\aaacostco\\functions\\service-account.json';
    if (fs.existsSync(fallback)) {
        global.validPath = fallback;
    } else {
        throw new Error(`Service account not found`);
    }
} else {
    global.validPath = serviceAccountPath;
}

const serviceAccount = JSON.parse(fs.readFileSync(global.validPath, 'utf8'));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function run() {
    console.log("🔍 Checking 'products' for Kirkland tags...");

    try {
        // Check finding by 'Kirkland Signature'
        const q1 = await db.collection('products')
            .where('additionalCategories', 'array-contains', 'Kirkland Signature')
            .limit(5).get();

        console.log(`\nBy 'Kirkland Signature': Found ${q1.size} docs`);
        q1.forEach(doc => console.log(` - ${doc.id}: ${doc.data().additionalCategories.join(', ')}`));

        // Check finding by 'Kirkland'
        const q2 = await db.collection('products')
            .where('additionalCategories', 'array-contains', 'Kirkland')
            .limit(5).get();

        console.log(`\nBy 'Kirkland': Found ${q2.size} docs`);
        q2.forEach(doc => console.log(` - ${doc.id}: ${doc.data().additionalCategories.join(', ')}`));

    } catch (error) {
        console.error("❌ Database Error:", error);
    }
}

run();
