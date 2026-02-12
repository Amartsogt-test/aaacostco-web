import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const scraper = require('../../functions/scraper.js');

// 1. Initialize Firebase Admin
let serviceAccount;
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, '../../functions/service-account.json');

try {
    if (fs.existsSync(serviceAccountPath)) {
        serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    } else {
        console.error("❌ No service account found.");
        process.exit(1);
    }
} catch (err) {
    console.error("❌ Failed to read service account:", err.message);
    process.exit(1);
}


// Use the CJS admin instance that scraper.js will use
const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("🔥 Firebase Admin Initialized (CJS)");
}

// 2. Run the Sync Function
async function run() {
    console.log("🚀 Starting Local Sync & Cleanup...");
    console.log("This will fetch live data and remove expired 'Sale' tags.");

    try {
        const result = await scraper.syncSpecialCategories(admin);
        console.log("✅ Sync Complete!");
        console.log("Summary:", result);
    } catch (error) {
        console.error("❌ Sync Failed:", error);
    }
}

run();
