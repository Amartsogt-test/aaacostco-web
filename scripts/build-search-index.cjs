const admin = require('firebase-admin');
const serviceAccount = require('../functions/service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Size limit: We'll use ~700KB per chunk to be safe (Firestore limit is 1MB)
const ITEMS_PER_CHUNK = 500;

async function buildSearchIndex() {
    console.log('🔍 Building search index...');

    const productsSnapshot = await db.collection('products')
        .where('status', '!=', 'deleted')
        .get();

    const indexItems = [];

    productsSnapshot.forEach(doc => {
        const data = doc.data();
        // Minimal fields only - reduce size
        indexItems.push({
            id: doc.id,
            n: data.name || '',           // name (shortened key)
            m: data.name_mn || '',         // name_mn
            e: data.englishName || '',     // englishName
            b: data.brand || '',           // brand
            c: data.code || '',            // code
            i: data.image || '',           // image
            p: data.price?.value || data.price || 0,    // price
            o: data.originalPrice?.value || data.originalPrice || 0, // originalPrice
            d: data.hasDiscount || false,  // hasDiscount
            s: data.status || 'active',    // status
            cat: data.categoryCode || '',  // categoryCode
            ac: data.additionalCategories || [], // additionalCategories
            w: data.estimatedWarehousePrice || 0, // NEW: estimatedWarehousePrice
            mk: data.estimatedMarkupKrw || 0  // NEW: estimatedMarkupKrw
        });
    });

    console.log(`Total products: ${indexItems.length}`);

    // Split into chunks
    const chunks = [];
    for (let i = 0; i < indexItems.length; i += ITEMS_PER_CHUNK) {
        chunks.push(indexItems.slice(i, i + ITEMS_PER_CHUNK));
    }

    console.log(`Splitting into ${chunks.length} chunks...`);

    // Write each chunk as a separate document
    const batch = db.batch();

    for (let i = 0; i < chunks.length; i++) {
        const chunkRef = db.collection('system').doc(`search_index_${i}`);
        batch.set(chunkRef, {
            items: chunks[i],
            chunkIndex: i,
            count: chunks[i].length,
            totalChunks: chunks.length,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }

    // Write metadata document
    const metaRef = db.collection('system').doc('search_index_meta');
    batch.set(metaRef, {
        totalItems: indexItems.length,
        totalChunks: chunks.length,
        itemsPerChunk: ITEMS_PER_CHUNK,
        version: Date.now(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();

    console.log(`✅ Search index built: ${indexItems.length} items in ${chunks.length} chunks`);
    process.exit(0);
}

buildSearchIndex().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
});
