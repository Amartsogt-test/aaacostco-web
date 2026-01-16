
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

const serviceAccount = JSON.parse(fs.readFileSync('./functions/service-account.json', 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function findByPrice() {
    console.log("Searching by price...");

    // Try exact price match from screenshot
    // Price: 204900
    const snap1 = await db.collection('products').where('price', '==', 204900).get();
    console.log(`Found ${snap1.size} products with price 204900`);
    snap1.forEach(doc => {
        const d = doc.data();
        console.log(`[${doc.id}] ${d.englishName} | ${d.name} | Weight: ${d.weight}kg`);
    });

    // Try original price: 259900
    const snap2 = await db.collection('products').where('originalPrice', '==', 259900).get();
    console.log(`Found ${snap2.size} products with originalPrice 259900`);
    snap2.forEach(doc => {
        const d = doc.data();
        console.log(`[${doc.id}] ${d.englishName} | ${d.name} | Weight: ${d.weight}kg`);
    });
}

findByPrice().catch(console.error);
