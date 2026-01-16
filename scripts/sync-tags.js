
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
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

async function syncTags(collectionName, tagName) {
    console.log(`\n🔄 Syncing ${tagName} from ${collectionName}...`);
    try {
        const specialSnap = await db.collection(collectionName).get();
        if (specialSnap.empty) {
            console.log(`⚠️ ${collectionName} is empty. Skipping.`);
            return;
        }

        console.log(`Found ${specialSnap.size} products in ${collectionName}. Updating main 'products' collection...`);

        const batchSize = 500;
        let batch = db.batch();
        let count = 0;
        let totalUpdated = 0;

        for (const docSnap of specialSnap.docs) {
            const productId = docSnap.id;
            const productRef = db.collection('products').doc(productId);

            // We use arrayUnion to safely add the tag without overwriting others
            batch.update(productRef, {
                additionalCategories: FieldValue.arrayUnion(tagName),
                updatedAt: new Date().toISOString()
            });

            count++;
            if (count >= batchSize) {
                await batch.commit();
                totalUpdated += count;
                console.log(` - Committed batch of ${count} updates...`);
                batch = db.batch();
                count = 0;
            }
        }

        if (count > 0) {
            await batch.commit();
            totalUpdated += count;
        }

        console.log(`✅ Successfully updated ${totalUpdated} products with tag '${tagName}'.`);

    } catch (error) {
        console.error(`❌ Error syncing ${tagName}:`, error);
    }
}

async function run() {
    await syncTags('products_kirkland', 'Kirkland Signature');
    await syncTags('products_new', 'New');
    await syncTags('products_sale', 'Sale');
    await syncTags('products_featured', 'Featured');
    console.log("\n✨ All syncs completed.");
}

run();
