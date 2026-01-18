const admin = require('firebase-admin');
const serviceAccount = require('./functions/service-account.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function syncHomePrices() {
    console.log("Reading home_products...");
    const homeSnapshot = await db.collection('home_products').get();

    if (homeSnapshot.empty) {
        console.log("No home products found.");
        return;
    }

    console.log(`Found ${homeSnapshot.size} home products. Syncing prices...`);

    let updated = 0;
    const batchSize = 100;
    let batch = db.batch();
    let counter = 0;

    const batches = [];

    // Pre-fetch all real products logic is hard because of memory.
    // Let's do it individually or in chunks.
    // For 50 items it's fast.

    for (const doc of homeSnapshot.docs) {
        const homeData = doc.data();
        const productRef = db.collection('products').doc(doc.id);
        const productSnap = await productRef.get();

        if (productSnap.exists) {
            const realData = productSnap.data();

            // Check if update needed
            const newPrice = realData.estimatedWarehousePrice;
            const newMarkup = realData.estimatedMarkupKrw;
            const newWeight = realData.weight;

            if (newPrice !== homeData.estimatedWarehousePrice ||
                newMarkup !== homeData.estimatedMarkupKrw ||
                newWeight !== homeData.weight) {

                batch.update(doc.ref, {
                    estimatedWarehousePrice: newPrice || realData.price || 0, // Fallback to price if null
                    estimatedMarkupKrw: newMarkup || 0,
                    weight: newWeight || 0,
                    price: realData.price // Sync base price too just in case
                });
                updated++;
                counter++;
            }
        }

        if (counter >= batchSize) {
            batches.push(batch.commit());
            batch = db.batch();
            counter = 0;
        }
    }

    if (counter > 0) {
        batches.push(batch.commit());
    }

    await Promise.all(batches);
    console.log(`✅ Synced ${updated} products in home_products.`);
}

syncHomePrices().catch(console.error);
