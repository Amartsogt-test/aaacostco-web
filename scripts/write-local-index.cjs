const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const serviceAccount = require('../functions/service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || '(default)';
const db = FIRESTORE_DATABASE_ID === '(default)'
    ? admin.firestore()
    : require('firebase-admin/firestore').getFirestore(admin.app(), FIRESTORE_DATABASE_ID);

async function buildSearchIndex() {
    console.log('🔍 Fetching all products...');

    const productsSnapshot = await db.collection('products').get();
    console.log(`Fetched ${productsSnapshot.size} documents.`);

    const indexItems = [];

    productsSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.status === 'deleted') return; // Filter deleted in-memory
        if (data.status !== 'active') return;  // Only active products
        
        indexItems.push({
            id: doc.id,
            n: data.name || '',
            m: data.name_mn || '',
            e: data.englishName || '',
            b: data.brand || '',
            c: data.code || '',
            i: data.image || '',
            p: data.price?.value || data.price || 0,
            o: data.originalPrice?.value || data.originalPrice || 0,
            d: data.hasDiscount || false,
            s: data.status || 'active',
            cat: data.categoryCode || '',
            ac: data.additionalCategories || [],
            w: data.estimatedWarehousePrice || 0,
            mk: data.estimatedMarkupKrw || 0,
            sm: (data.description_mn || data.shortDescription || data.description || '').replace(/<[^>]*>?/gm, ' ').substring(0, 500)
        });
    });

    console.log(`Total active products: ${indexItems.length}`);

    const staticPayload = {
        version: Date.now(),
        totalItems: indexItems.length,
        items: indexItems,
    };
    
    const outPath = path.join(__dirname, '../public/search-index.json');
    fs.writeFileSync(outPath, JSON.stringify(staticPayload));
    
    const kb = (fs.statSync(outPath).size / 1024).toFixed(1);
    console.log(`✅ Static public/search-index.json built: (${kb} KB)`);
    process.exit(0);
}

buildSearchIndex().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
});
