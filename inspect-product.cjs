
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const serviceAccountPath = path.join(__dirname, 'functions/service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkProduct() {
    const id = '173591';
    console.log(`Fetching product ${id}...`);
    const doc = await db.collection('products').doc(id).get();

    if (!doc.exists) {
        console.log('Product not found!');
    } else {
        const p = doc.data();
        console.log(JSON.stringify({
            id: doc.id,
            price: p.price,
            originalPrice: p.originalPrice,
            estimatedWarehousePrice: p.estimatedWarehousePrice,
            weight: p.weight,
            aiWeight: p.aiWeight,
            estimatedMarkupKrw: p.estimatedMarkupKrw,
            discountEndDate: p.discountEndDate,
            updatedAt: p.updatedAt,
            lastFixed: p.lastFixed
        }, null, 2));
    }
}

checkProduct().catch(console.error);
