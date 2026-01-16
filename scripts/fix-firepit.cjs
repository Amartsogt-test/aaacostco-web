
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

const serviceAccount = JSON.parse(fs.readFileSync('./functions/service-account.json', 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function fixFirePit() {
    const id = '5349420';
    console.log(`Fixing weight for ${id}...`);

    const updates = {
        weight: 17,
        aiWeight: 17
    };

    // Update products
    await db.collection('products').doc(id).update(updates);
    console.log("Updated products collection.");

    // Update home_products
    const homeRef = db.collection('home_products').doc(id);
    const doc = await homeRef.get();
    if (doc.exists) {
        await homeRef.update(updates);
        console.log("Updated home_products collection.");
    } else {
        console.log("Not found in home_products.");
    }
}

fixFirePit().catch(console.error);
