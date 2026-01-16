
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

const serviceAccount = JSON.parse(fs.readFileSync('./functions/service-account.json', 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function checkHomeProduct() {
    const id = '1752002';
    console.log(`Checking home_products/${id}...`);

    const doc = await db.collection('home_products').doc(id).get();
    if (!doc.exists) {
        console.log("Not found in home_products");
    } else {
        const d = doc.data();
        console.log(`home_products Data:`, JSON.stringify(d, null, 2));
    }

    console.log("Checking products/" + id + " full data...");
    const pDoc = await db.collection('products').doc(id).get();
    if (pDoc.exists) {
        const d = pDoc.data();
        console.log(`products Data:`);
        console.log(`Weight: ${d.weight}`);
        console.log(`AI Weight: ${d.aiWeight}`);
    }
}

checkHomeProduct().catch(console.error);
