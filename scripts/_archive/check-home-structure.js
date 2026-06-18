
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
    console.log("🔍 Checking 'home_products' Document Structure...");

    try {
        const snapshot = await db.collection('home_products').limit(5).get();
        if (snapshot.empty) {
            console.log("⚠️ home_products is EMPTY.");
            return;
        }

        console.log(`Found ${snapshot.size} sample docs.`);
        snapshot.forEach(doc => {
            const data = doc.data();
            console.log(`\n📄 Doc ID: ${doc.id}`);
            console.log(`   - has 'sortOrder'? ${'sortOrder' in data} (Value: ${data.sortOrder})`);
            console.log(`   - has 'price'? ${'price' in data}`);
            console.log(`   - status: ${data.status}`);
        });

    } catch (error) {
        console.error("❌ Database Error:", error);
    }
}

run();
