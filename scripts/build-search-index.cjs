const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const serviceAccount = require('../functions/service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

// Target a region-local named database when FIRESTORE_DATABASE_ID is set (Asia migration).
const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || '(default)';
const db = FIRESTORE_DATABASE_ID === '(default)'
    ? admin.firestore()
    : require('firebase-admin/firestore').getFirestore(admin.app(), FIRESTORE_DATABASE_ID);

// Size limit: We'll use ~700KB per chunk to be safe (Firestore limit is 1MB)
const ITEMS_PER_CHUNK = 500;

async function buildSearchIndex() {
    console.log('🔍 Building search index...');

    const indexItems = [];

    const stream = db.collection('products').stream();

    for await (const doc of stream) {
        const data = doc.data();
        if (data.status === 'deleted') continue; // Filter deleted in-memory
        if (data.status !== 'active') continue;  // Only active products
        // Minimal fields only - reduce size
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
    }

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

    // 🚀 Also write a single STATIC search index for the app to load from the CDN
    // (Firebase Hosting edge, near Mongolia) instead of pulling meta + N chunks from
    // the far-away Firestore on the user's first search. Same shortened-key shape as
    // the chunks, so the client expands it with its existing logic.
    const staticPayload = {
        version: Date.now(),
        totalItems: indexItems.length,
        items: indexItems,
    };
    const outPath = path.join(__dirname, '../public/search-index.json');
    fs.writeFileSync(outPath, JSON.stringify(staticPayload));
    const kb = (fs.statSync(outPath).size / 1024).toFixed(1);
    console.log(`✅ Search index built: ${indexItems.length} items in ${chunks.length} chunks + static public/search-index.json (${kb} KB)`);
    process.exit(0);
}

buildSearchIndex().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
});
