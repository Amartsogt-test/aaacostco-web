
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

const serviceAccount = JSON.parse(fs.readFileSync('./functions/service-account.json', 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function findProductByName() {
    console.log("Searching for products containing 'SunVilla'...");

    // Fetch all products and filter locally for simplicity
    const snapshot = await db.collection('products').get();
    let found = 0;

    snapshot.forEach(doc => {
        const d = doc.data();
        const str = (d.englishName + " " + d.name + " " + d.description).toLowerCase();
        if (str.includes('sunvilla') && str.includes('3.3')) {
            console.log("---------------------------------------------------");
            console.log(`ID: ${doc.id}`);
            console.log(`Name (EN): ${d.englishName}`);
            console.log(`Name (MN): ${d.name}`);
            console.log(`Weight: ${d.weight} (AI: ${d.aiWeight})`);
            console.log(`Price: ${d.price}`);
            found++;
        }
    });

    if (found === 0) {
        console.log("No partial match found for 'sunvilla' and '3.3'. Checking just 'SunVilla'...");
        snapshot.forEach(doc => {
            const d = doc.data();
            const str = (d.englishName + " " + d.name).toLowerCase();
            if (str.includes('sunvilla')) {
                console.log(`[${doc.id}] ${d.englishName} | ${d.weight}kg`);
            }
        });
    }
}

findProductByName().catch(console.error);
