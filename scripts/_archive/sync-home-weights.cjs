
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

const serviceAccount = JSON.parse(fs.readFileSync('./functions/service-account.json', 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function syncHomeWeights() {
    console.log("Fetching home_products...");
    const homeSnaps = await db.collection('home_products').get();
    console.log(`Found ${homeSnaps.size} home products.`);

    let updated = 0;
    const batchSize = 500;
    let batch = db.batch();
    let count = 0;

    for (const doc of homeSnaps.docs) {
        const homeData = doc.data();
        const id = doc.id;

        // If weight/aiWeight is missing, fetch from products
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

    console.log(`Total updated: ${updated}`);
}

syncHomeWeights().catch(console.error);
