/**
 * sync-home-weights.cjs — copy weight/aiWeight from products → home_products
 * for any home product missing it (needed so the home cards can compute shipping
 * cost). Part of the daily pipeline (npm run core:home-weights).
 *
 * Restored from _archive (package.json referenced this path but the file was
 * missing, which broke `npm run core:daily`). Now also honours
 * FIRESTORE_DATABASE_ID for the Asia-region database migration.
 */
const path = require('path');
const fs = require('fs');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    || path.join(__dirname, '../functions/service-account.json');
if (!fs.existsSync(serviceAccountPath)) {
    console.error('❌ No service account at', serviceAccountPath);
    process.exit(1);
}
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
initializeApp({ credential: cert(serviceAccount) });

// Target a region-local named database when FIRESTORE_DATABASE_ID is set.
const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || '(default)';
const db = FIRESTORE_DATABASE_ID === '(default)'
    ? getFirestore()
    : getFirestore(FIRESTORE_DATABASE_ID);

async function syncHomeWeights() {
    console.log('Fetching home_products...');
    const homeSnaps = await db.collection('home_products').get();
    console.log(`Found ${homeSnaps.size} home products.`);

    let updated = 0;
    const batchSize = 500;
    let batch = db.batch();
    let count = 0;

    for (const doc of homeSnaps.docs) {
        const homeData = doc.data();
        const id = doc.id;

        // If weight/aiWeight is missing, fetch from the products collection.
        if (homeData.weight === undefined && homeData.aiWeight === undefined) {
            const pDoc = await db.collection('products').doc(id).get();
            if (pDoc.exists) {
                const pData = pDoc.data();
                const updates = {};
                if (pData.weight !== undefined) updates.weight = pData.weight;
                if (pData.aiWeight !== undefined) updates.aiWeight = pData.aiWeight;

                if (Object.keys(updates).length > 0) {
                    batch.update(doc.ref, updates);
                    count++;
                    updated++;
                }
            }
        }

        if (count >= batchSize) {
            await batch.commit();
            console.log(`Committed batch of ${count} updates.`);
            batch = db.batch();
            count = 0;
        }
    }

    if (count > 0) {
        await batch.commit();
        console.log(`Committed final batch of ${count} updates.`);
    }

    console.log(`✅ Total updated: ${updated}`);
    process.exit(0);
}

syncHomeWeights().catch((e) => { console.error('Fatal:', e); process.exit(1); });
