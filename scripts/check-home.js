
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
    console.log("🔍 Checking 'home_products' Collection...");

    try {
        const snapshot = await db.collection('home_products').count().get();
        const count = snapshot.data().count;
        console.log(`📊 'home_products' Count: ${count}`);

        if (count === 0) {
            console.log("⚠️ home_products is EMPTY. This explains why Home page is empty.");
        }

    } catch (error) {
        console.error("❌ Database Error:", error);
    }
}

run();
