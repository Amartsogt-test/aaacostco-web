const path = require('path');
const serviceAccount = require('../functions/service-account.json');

// Force using the functions' firebase-admin so instances match
const admin = require('../functions/node_modules/firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const scraper = require('../functions/scraper.js');

async function run() {
    console.log("Running fixZeroPriceProducts...");
    try {
        const result = await scraper.fixZeroPriceProducts();
        console.log("Result:", result);
        process.exit(0);
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}
run();
