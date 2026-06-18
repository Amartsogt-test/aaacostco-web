const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

const serviceAccount = JSON.parse(fs.readFileSync('./functions/service-account.json', 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function findZeroPricedProducts() {
    console.log("Searching for products with price 0...");

    // Check price.value == 0
    let snapshotValue = await db.collection('products').where('price.value', '==', 0).get();
    console.log(`Query (price.value == 0): Found ${snapshotValue.size} products.`);

    // Check top-level price == 0 (legacy/inconsistent data)
    let snapshotLegacy = await db.collection('products').where('price', '==', 0).get();
    console.log(`Query (top-level price == 0): Found ${snapshotLegacy.size} products.`);

    // Check estimatedWarehousePrice == 0
    let snapshotWarehouse = await db.collection('products').where('estimatedWarehousePrice', '==', 0).get();
    console.log(`Query (estimatedWarehousePrice == 0): Found ${snapshotWarehouse.size} products.`);

    // Combine results
    const allDocs = new Map();
    snapshotValue.forEach(doc => allDocs.set(doc.id, doc));
    snapshotLegacy.forEach(doc => allDocs.set(doc.id, doc));
    snapshotWarehouse.forEach(doc => allDocs.set(doc.id, doc));

    if (allDocs.size === 0) {
        console.log('No matching documents found.');
        return;
    }

    console.log(`Total unique products found: ${allDocs.size}`);
    allDocs.forEach(doc => {
        const d = doc.data();
        let priceVal = d.price;
        if (d.price && d.price.value !== undefined) {
            priceVal = d.price.value;
        }
        console.log(`[${doc.id}] ${d.name} (${d.englishName}) | Price: ${JSON.stringify(d.price)}`);
    });
}

findZeroPricedProducts().catch(console.error);
