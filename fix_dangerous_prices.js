import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./functions/service-account.json', 'utf8'));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function fixDangerousPrices() {
    console.log("Fetching active products to fix...");
    let fixedCount = 0;
    
    // Instead of doing snapshot.docs, we use stream to avoid huge memory usage
    const stream = db.collection('products')
        .where('status', '==', 'active')
        .select('priceKRW', 'price', 'estimatedWarehousePrice', 'estimatedMarkupKrw', 'hasDiscount')
        .stream();

    let batch = db.batch();
    let batchCounter = 0;
    let pendingBatches = [];

    await new Promise((resolve, reject) => {
        stream.on('data', (doc) => {
            const p = doc.data();
            const price = p.priceKRW || p.price || 0;
            const warehousePrice = p.estimatedWarehousePrice;
            const markup = typeof p.estimatedMarkupKrw === 'number' ? p.estimatedMarkupKrw : 0;
            
            if (!warehousePrice || !price) return;
            
            const expectedWarehousePrice = price > markup ? price - markup : price;
            const difference = expectedWarehousePrice - warehousePrice;
            
            // If the difference is > 2000, we consider it a stale warehouse price
            if (difference > 2000) { 
                batch.update(doc.ref, {
                    estimatedWarehousePrice: expectedWarehousePrice
                });
                
                batchCounter++;
                fixedCount++;
                
                if (batchCounter >= 400) {
                    pendingBatches.push(batch.commit());
                    batch = db.batch();
                    batchCounter = 0;
                    console.log(`Committed partial batch of fixes...`);
                }
            }
        });

        stream.on('end', resolve);
        stream.on('error', reject);
    });

    if (batchCounter > 0) {
        pendingBatches.push(batch.commit());
    }

    await Promise.all(pendingBatches);
    console.log(`\n✅ Successfully fixed estimatedWarehousePrice for ${fixedCount} products.`);
}

fixDangerousPrices().catch(console.error).then(() => process.exit(0));
