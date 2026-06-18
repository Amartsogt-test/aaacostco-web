import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./functions/service-account.json', 'utf8'));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function checkDangerousPrices() {
    console.log("Streaming active products...");
    let totalProducts = 0;
    let dangerousProducts = [];
    let discountBugs = 0;

    const stream = db.collection('products')
        .where('status', '==', 'active')
        .select('priceKRW', 'price', 'estimatedWarehousePrice', 'estimatedMarkupKrw', 'hasDiscount', 'name', 'name_mn')
        .stream();

    return new Promise((resolve, reject) => {
        stream.on('data', (doc) => {
            const p = doc.data();
            totalProducts++;
            
            const price = p.priceKRW || p.price || 0;
            const warehousePrice = p.estimatedWarehousePrice;
            const markup = p.estimatedMarkupKrw || 0;
            
            if (!warehousePrice || !price) return;
            
            const expectedWarehousePrice = price > markup ? price - markup : price;
            const difference = expectedWarehousePrice - warehousePrice;
            
            if (difference > 2000) { 
                dangerousProducts.push({
                    id: doc.id,
                    name: p.name_mn || p.name,
                    price: price,
                    warehousePrice: warehousePrice,
                    expectedWarehousePrice,
                    markup: markup,
                    difference: difference,
                    hasDiscount: p.hasDiscount
                });
                if (p.hasDiscount === false) {
                    discountBugs++;
                }
            }
        });

        stream.on('end', () => {
            console.log(`\nTotal Active Products checked: ${totalProducts}`);
            console.log(`Dangerous Products found (underpriced by > 2000 KRW): ${dangerousProducts.length}`);
            console.log(`Products underpriced while hasDiscount=false: ${discountBugs}`);
            
            dangerousProducts.sort((a, b) => b.difference - a.difference);
            console.log("\nTop 15 worst offenders:");
            dangerousProducts.slice(0, 15).forEach(p => {
                console.log(`[${p.id}] Price: ${p.price} | Warehouse: ${p.warehousePrice} | Markup: ${p.markup} | DangerGap: ${p.difference} | hasDiscount: ${p.hasDiscount} | Name: ${p.name}`);
            });
            resolve();
        });

        stream.on('error', reject);
    });
}

checkDangerousPrices().catch(console.error).then(() => process.exit(0));
