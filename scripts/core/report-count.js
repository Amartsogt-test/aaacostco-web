
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serviceAccountPath = path.join(__dirname, '../../functions/service-account.json');
if (!fs.existsSync(serviceAccountPath)) {
    console.error(`❌ Service account file not found at: ${serviceAccountPath}`);
    process.exit(1);
}
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

initializeApp({
    credential: cert(serviceAccount)
});

const db = getFirestore();

// Manual Copy of IDs from menuData.js to avoid import issues
const MENU_IDS = [
    'Electronics', 'Appliances', 'Furniture', 'Kitchen', 'Baby_Toys',
    'Sports', 'Patio', 'Fashion', 'Jewelry', 'Beauty', 'Health',
    'Tools', 'Food', 'Office', 'GiftSets'
];

async function main() {
    console.log("Analyzing Product Categories in Firestore...");

    const snapshot = await db.collection('products').get();
    console.log(`Total Products: ${snapshot.size}`);

    const catCounts = {};
    const subCounts = {};
    const unknownCats = {};

    snapshot.docs.forEach(doc => {
        const p = doc.data();
        const cat = p.category || 'Uncategorized';
        const sub = p.subCategory || 'No Subcategory';

        // Count Main
        catCounts[cat] = (catCounts[cat] || 0) + 1;

        // Count Sub
        if (!subCounts[cat]) subCounts[cat] = {};
        subCounts[cat][sub] = (subCounts[cat][sub] || 0) + 1;

        // Check against MENU_IDS
        const knownCat = MENU_IDS.includes(cat);
        if (!knownCat) {
            unknownCats[cat] = (unknownCats[cat] || 0) + 1;
        }
    });

    console.log("\n--- Category Counts ---");
    const sortedCats = Object.keys(catCounts).sort();
    sortedCats.forEach(c => {
        console.log(`[${c}]: ${catCounts[c]}`);
    });

    console.log("\n--- Subcategory Details ---");
    Object.keys(subCounts).sort().forEach(c => {
        console.log(`\n> ${c} (${catCounts[c]})`);
        Object.keys(subCounts[c]).sort().forEach(s => {
            console.log(`  - ${s}: ${subCounts[c][s]}`);
        });
    });

    console.log("\n---------------------------------------------------");
    if (Object.keys(unknownCats).length > 0) {
        console.log("\n⚠️  WARNING: UNKNOWN CATEGORIES FOUND (Not in Menu) ⚠️");
        Object.keys(unknownCats).forEach(c => {
            console.log(`  🔴 ${c}: ${unknownCats[c]} items`);
        });
    } else {
        console.log("\n✅ SUCCESS: All products map to valid Categories.");
    }
}

main().catch(console.error);
