const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

async function checkDangerousPrices() {
    console.log("Fetching all products...");
    const snapshot = await db.collection('products').get();
    
    let totalProducts = 0;
    let dangerousProducts = [];
    let countMissingMarkup = 0;
    let discountBugs = 0;
    
    snapshot.forEach(doc => {
        const p = doc.data();
        totalProducts++;
        
        const price = p.priceKRW || p.price || 0;
        const warehousePrice = p.estimatedWarehousePrice;
        const markup = p.estimatedMarkupKrw || 0;
        
        if (!warehousePrice || !price) return;
        
        // normally warehousePrice = price - markup
        // if warehousePrice is MUCH lower than price - markup, it's a danger
        // meaning warehousePrice was calculated when `price` was lower (like an old discount)
        const expectedWarehousePrice = price > markup ? price - markup : price;
        const difference = expectedWarehousePrice - warehousePrice;
        
        if (difference > 1000) { // More than 1000 won unexpected difference
            dangerousProducts.push({
                id: doc.id,
                name: p.name_mn || p.name,
                price: price,
                warehousePrice: warehousePrice,
                markup: markup,
                difference: difference,
                hasDiscount: p.hasDiscount,
                discountValue: p.couponDiscount?.discountValue || p.discountPercent || p.discount || 0
            });
            
            if (p.hasDiscount === false && difference >= 2000) {
                discountBugs++;
            }
        }
    });
    
    console.log(`Total Products checked: ${totalProducts}`);
    console.log(`Dangerous Products found: ${dangerousProducts.length}`);
    console.log(`Likely due to expired discounts (hasDiscount=false but warehousePrice is too low): ${discountBugs}`);
    
    // Print top 10 worst offenders
    dangerousProducts.sort((a, b) => b.difference - a.difference);
    console.log("\nTop 10 worst cases:");
    dangerousProducts.slice(0, 10).forEach(p => {
        console.log(`[${p.id}] ${p.name} | Price: ${p.price} | Warehouse: ${p.warehousePrice} | Markup: ${p.markup} | DangerGap: ${p.difference} | hasDiscount: ${p.hasDiscount}`);
    });
}

checkDangerousPrices().catch(console.error);
