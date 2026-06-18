
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Correct Path Resolution
// Scripts are in e:\Google Drive\aaacostco\scripts
// Functions are in e:\Google Drive\aaacostco\functions
const serviceAccountPath = path.resolve(__dirname, '../functions/service-account.json');
if (!fs.existsSync(serviceAccountPath)) {
    // Try absolute path fallback if relative fails
    console.warn("Relative path failed, trying fallback...");
    // Hardcode for Windows environment as fallback
    const fallback = 'e:\\Google Drive\\aaacostco\\functions\\service-account.json';
    if (fs.existsSync(fallback)) {
        // Re-read
        global.validPath = fallback;
    } else {
        throw new Error(`Service account not found at ${serviceAccountPath} or ${fallback}`);
    }
} else {
    global.validPath = serviceAccountPath;
}

const serviceAccount = JSON.parse(fs.readFileSync(global.validPath, 'utf8'));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function run() {
    console.log("🔍 Checking Database Status...");
    const start = Date.now();

    try {
        // 1. Check Count of Active Products
        const snapshot = await db.collection('products')
            .where('status', '==', 'active')
            .count()
            .get();

        const count = snapshot.data().count;
        const duration = Date.now() - start;
        console.log(`✅ Connection OK. Latency: ${duration}ms`);
        console.log(`📊 Active Products Count: ${count}`);

        if (count === 0) {
            console.warn("⚠️ WARNING: 0 Active products found! Checking total products...");
            const totalSnap = await db.collection('products').count().get();
            console.log(`📊 Total Products Count (Any Status): ${totalSnap.data().count}`);

            // Fetch one to see what happened to status
            const sample = await db.collection('products').limit(1).get();
            if (!sample.empty) {
                console.log("📄 Sample Document:");
                console.log(JSON.stringify(sample.docs[0].data(), null, 2));
            }
        } else {
            // Fetch "Spam" specifically to see if it was updated
            const spamSnap = await db.collection('products')
                .where('name', '>=', 'Spam')
                .where('name', '<=', 'Spam\uf8ff')
                .limit(1)
                .get();

            if (!spamSnap.empty) {
                const doc = spamSnap.docs[0].data();
                console.log(`\n🥩 Spam Product Check:`);
                console.log(`Name: ${doc.name}`);
                console.log(`Weight: ${doc.weight} kg`);
                console.log(`AI Reason: ${doc.aiWeightReason}`);
            } else {
                console.log("\n🥩 Spam product not found by name query.");
            }
        }

    } catch (error) {
        console.error("❌ Database Error:", error);
    }
}

run();
