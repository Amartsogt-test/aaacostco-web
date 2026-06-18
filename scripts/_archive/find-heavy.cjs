
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

const serviceAccount = JSON.parse(fs.readFileSync('./functions/service-account.json', 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function findProduct() {
    console.log("Searching for '3.3m' or 'SunVilla'...");
    // We can't do broad text search easily in Firestore without exact match or extra index
    // So let's fetch products with high weights (>1000) to find the culprit

    const snapshot = await db.collection('products')
        .where('weight', '>', 500)
        .get();

    console.log(`Found ${snapshot.size} products with weight > 500kg`);
    snapshot.forEach(doc => {
        const d = doc.data();
        console.log(`[${doc.id}] ${d.englishName} | ${d.name} | Weight: ${d.weight}kg | Price: ${d.price}`);
    });
}

findProduct().catch(console.error);
