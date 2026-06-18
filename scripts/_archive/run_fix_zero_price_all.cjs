const path = require('path');
const serviceAccount = require('../functions/service-account.json');
const admin = require('../functions/node_modules/firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

// Use the private fetchProductDetails function
async function fetchJson(url, cookie = '', userAgent = '') {
    const headers = { 'User-Agent': userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' };
    if (cookie) headers['Cookie'] = cookie;
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
}

async function run() {
    console.log("Fetching settings...");
    const settingsSnap = await db.collection('settings').doc('scraper').get();
    const { cookie = '', userAgent = '' } = settingsSnap.data() || {};
    
    console.log("Fetching 0 price products...");
    const snap = await db.collection('products').where('price', '==', 0).get();
    if (snap.empty) {
        console.log("No 0 price products found.");
        process.exit(0);
    }
    
    const batch = db.batch();
    let count = 0;
    
    for (const doc of snap.docs) {
        const pCode = doc.id;
        console.log(`Checking ${pCode}...`);
        try {
            const url = `https://www.costco.co.kr/rest/v2/korea/products/${pCode}?fields=FULL`;
            const detail = await fetchJson(url, cookie, userAgent);
            if (detail && detail.price && detail.price.value > 0) {
                const price = detail.price.value;
                const originalPrice = detail.basePrice ? detail.basePrice.value : price;
                batch.update(doc.ref, {
                    price,
                    originalPrice,
                    hasDiscount: originalPrice > price,
                    lastScraped: new Date().toISOString()
                });
                console.log(`✅ Fixed ${pCode} -> ${price} Won`);
                count++;
            } else {
                console.log(`❌ Price still 0 or not found for ${pCode}`);
            }
        } catch(e) {
            console.log(`❌ Failed to fetch ${pCode}`);
        }
        await new Promise(r => setTimeout(r, 100)); // sleep
    }
    
    if (count > 0) {
        await batch.commit();
        console.log(`Successfully updated ${count} products.`);
    } else {
        console.log("No products were updated.");
    }
    process.exit(0);
}
run();
