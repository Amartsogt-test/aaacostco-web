const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const dotenv = require('dotenv');
const scraper = require('../functions/scraper.js');

// 1. Config
const envLocalPath = path.resolve(__dirname, '../.env.local');
dotenv.config({ path: envLocalPath });

const SERVICE_ACCOUNT_PATH = path.join(__dirname, '../functions/service-account.json');

// 2. Initialize Firebase
if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error(`Error: Service account not found at ${SERVICE_ACCOUNT_PATH}`);
    process.exit(1);
}
const serviceAccount = require(SERVICE_ACCOUNT_PATH);
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

// 3. Load Menu
const menuPath = path.join(__dirname, 'costco-flat-menu.json');
if (!fs.existsSync(menuPath)) {
    console.error(`Error: Menu file not found at ${menuPath}`);
    process.exit(1);
}
const menu = require(menuPath);

// 4. Prepare Targets
console.log(`Loaded menu with ${menu.length} entries. Extracting unique categories...`);

// Use a Map to keep unique codes but prefer deeper categories if duplicates exist?
// Actually codes are unique.
const targetsMap = new Map();

menu.forEach(item => {
    if (item.code && item.text) {
        // Skip some known non-product pages if any?
        // Assuming all cos_ codes are valid product categories
        targetsMap.set(item.code, {
            code: item.code,
            name: item.text, // e.g. "TV", "Apple"
            label: item.text,
            type: 'category',
            tagName: '__SYNC_ONLY__' // Dummy tag to avoid messing up 'Sale'/'Featured' collections vs general sync
        });
    }
});

const targets = Array.from(targetsMap.values());
console.log(`Found ${targets.length} unique category targets.`);

// 5. Run Sync
async function run() {
    console.log("🚀 Starting Full Source Sync (All Categories)...");
    console.log("⚠️  This process may take a long time.");

    try {
        const result = await scraper.syncWithTargets(targets, admin);
        console.log("✅ Full Sync Complete!");
        console.log(`Saved: ${result.saved}, Failed: ${result.failed}`);

        if (result.logs.length > 0) {
            const logPath = path.join(__dirname, 'last_sync_log.txt');
            fs.writeFileSync(logPath, result.logs.join('\n'));
            console.log(`📝 Log written to ${logPath}`);
        }

    } catch (error) {
        console.error("❌ Full Sync Failed:", error);
        process.exit(1);
    }
}

run();
