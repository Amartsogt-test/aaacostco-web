import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const serviceAccountPath = path.join(__dirname, '../functions/service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

// Scraper expects admin to be initialized
const scraper = require('../functions/scraper.js');

async function run() {
    console.log("Running fixZeroPriceProducts...");
    try {
        const result = await scraper.fixZeroPriceProducts(admin);
        console.log("Result:", result);
        process.exit(0);
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}
run();
