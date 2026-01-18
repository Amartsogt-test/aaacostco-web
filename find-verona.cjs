const admin = require('firebase-admin');
const serviceAccount = require('./functions/service-account.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function findProduct() {
    console.log("Checking ID 408462...");
    const docRef = db.collection('products').doc('408462');
    const doc = await docRef.get();

    if (doc.exists) {
        const product = doc.data();
        console.log(`✅ FOUND BY ID (408462):`);
        console.log(`Name (Original): ${product.name}`);
        console.log(`Name (MN): ${product.name_mn}`);
        console.log(`Description (MN - Start): ${(product.description_mn || '').substring(0, 100)}`);
        console.log(`Specifications (Original):`, JSON.stringify(product.specifications || []));
        console.log(`Specifications (MN):`, JSON.stringify(product.specifications_mn || []));
        console.log(`Short Desc: ${product.shortDescription || 'NONE'}`);
        console.log(`Price (KRW): ${product.price || product.priceKRW}`);
        console.log(`OriginalPrice: ${product.originalPrice}`);
        console.log(`Weight: ${product.weight}kg`);
        console.log(`AI Estimated Markup: ${product.estimatedMarkupKrw}`);
        console.log(`Estimated Warehouse Price: ${product.estimatedWarehousePrice}`);
        console.log(`AI Reason: ${product.aiWeightReason}`);
        process.exit(0);
    }

    console.log("ID not found, searching for 'Verona'...");
    const snapshot = await db.collection('products').get();

    let found = false;
    snapshot.forEach(doc => {
        const p = doc.data();
        const name = (p.name || '').toLowerCase() + (p.name_mn || '').toLowerCase();
        if (name.includes('verona')) {
            console.log("\nFOUND PRODUCT:");
            console.log(`ID: ${doc.id}`);
            console.log(`Name: ${p.name}`);
            console.log(`Price (KRW): ${p.price || p.priceKRW}`);
            console.log(`Weight: ${p.weight}kg`);
            console.log(`Estimated Warehouse Price: ${p.estimatedWarehousePrice}`);
            found = true;
        }
    });

    if (!found) console.log("Product not found.");
}

findProduct().catch(console.error);
