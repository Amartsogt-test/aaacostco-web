const admin = require('firebase-admin');
const serviceAccount = require('../functions/service-account.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function forceUpdateAllPrices() {
    console.log("Starting forced update of all estimatedWarehousePrices...");
    let updatedCount = 0;
    
    try {
        const productsSnapshot = await db.collection('products').get();
        console.log(`Found ${productsSnapshot.size} products.`);
        
        const batches = [];
        let currentBatch = db.batch();
        let operationCount = 0;
        
        productsSnapshot.forEach(doc => {
            const data = doc.data();
            const priceKRW = data.priceKRW || 0;
            let markup = data.estimatedMarkupKrw;
            
            // Apply default markup if missing
            if (markup === undefined || markup === null) {
                markup = priceKRW > 100000 ? 0 : 2000;
            }
            
            const expectedWarehousePrice = Math.max(0, priceKRW - markup);
            
            // Only update if the estimatedWarehousePrice is missing or incorrect, or if estimatedMarkupKrw was missing
            if (data.estimatedWarehousePrice !== expectedWarehousePrice || data.estimatedMarkupKrw === undefined) {
                currentBatch.update(doc.ref, {
                    estimatedWarehousePrice: expectedWarehousePrice,
                    estimatedMarkupKrw: markup
                });
                
                updatedCount++;
                operationCount++;
                
                if (operationCount === 400) {
                    batches.push(currentBatch);
                    currentBatch = db.batch();
                    operationCount = 0;
                }
            }
        });
        
        if (operationCount > 0) {
            batches.push(currentBatch);
        }
        
        console.log(`Need to update ${updatedCount} products. Committing batches...`);
        for (let i = 0; i < batches.length; i++) {
            await batches[i].commit();
            console.log(`Committed batch ${i + 1}/${batches.length}`);
        }
        
        console.log("✅ Successfully updated all prices!");
    } catch (error) {
        console.error("Error updating prices:", error);
    }
}

forceUpdateAllPrices();
