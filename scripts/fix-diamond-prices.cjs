const admin = require('firebase-admin');
const serviceAccount = require('../functions/service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const updates = [
    { id: '1696970', price: 274900000 },
    { id: '1828296', price: 221900000 },
    { id: '401472', price: 249000000 }
];

async function fixPrices() {
    console.log('💎 Fixing diamond prices...');

    for (const item of updates) {
        // Warehouse price is same as online price for expensive items (0 markup)
        const estimatedWarehousePrice = item.price;

        await db.collection('products').doc(item.id).update({
            price: { value: item.price, currency: 'KRW' },
            priceKRW: item.price,
            estimatedWarehousePrice: estimatedWarehousePrice,
            estimatedMarkupKrw: 0,
            updatedAt: new Date().toISOString()
        });
        console.log(`✅ Updated ${item.id} to ${item.price.toLocaleString()} KRW`);
    }

    console.log('Done.');
}

fixPrices().catch(console.error);
