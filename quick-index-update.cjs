const admin = require('firebase-admin');
const serviceAccount = require('./functions/service-account.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();
const ITEMS_PER_CHUNK = 500;

async function buildSearchIndex() {
    console.log('🔍 Building search index (Chunked Fetch)...');

    const indexItems = [];
    let lastDoc = null;
    let hasMore = true;
    let total = 0;

    while (hasMore) {
        let q = db.collection('products')
            .where('status', '==', 'active')
            .orderBy(admin.firestore.FieldPath.documentId())
            .limit(1000);

        if (lastDoc) {
            q = q.startAfter(lastDoc);
        }

        const snapshot = await q.get();

        if (snapshot.empty) {
            hasMore = false;
            break;
        }

        console.log(`Fetched ${snapshot.size} docs...`);

        snapshot.forEach(doc => {
            const data = doc.data();
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
                mk: data.estimatedMarkupKrw || 0
            });
        });

        lastDoc = snapshot.docs[snapshot.docs.length - 1];
        total += snapshot.size;

        // Safety break
        if (total > 10000) break;
    }

    console.log(`\nProcessed Total: ${indexItems.length} items.`);

    const chunks = [];
    for (let i = 0; i < indexItems.length; i += ITEMS_PER_CHUNK) {
        chunks.push(indexItems.slice(i, i + ITEMS_PER_CHUNK));
    }

    console.log(`Writing ${chunks.length} chunks...`);

    const batch = db.batch();
    for (let i = 0; i < chunks.length; i++) {
        const chunkRef = db.collection('system').doc(`search_index_${i}`);
        batch.set(chunkRef, {
            items: chunks[i],
            chunkIndex: i,
            totalChunks: chunks.length,
            version: Date.now()
        });
    }

    const metaRef = db.collection('system').doc('search_index_meta');
    batch.set(metaRef, {
        totalItems: indexItems.length,
        totalChunks: chunks.length,
        version: Date.now()
    });

    await batch.commit();
    console.log('\n✅ Search index built successfully!');
}

buildSearchIndex().catch(err => {
    console.error('❌ Error:', err);
});
