
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

const db = (process.env.FIRESTORE_DATABASE_ID && process.env.FIRESTORE_DATABASE_ID !== '(default)')
    ? getFirestore(process.env.FIRESTORE_DATABASE_ID)
    : getFirestore();

// The category CODES that exist in the storefront menu (src/data/menuData.js).
// A product is "menu-less" only when its category CODE isn't one of these —
// NOT when its display category is a Korean subcategory name or a tag. The old
// check compared the display `category` against English menu IDs, so every
// Korean/coded category looked "unknown" (a false alarm). We now check the code.
const MENU_CODES = [
    'cos_1', 'cos_2', 'cos_3', 'cos_4', 'cos_5', 'cos_6', 'cos_7', 'cos_8',
    'cos_9', 'cos_10', 'cos_11', 'cos_12', 'cos_14', 'cos_15'
];

// Codes/labels that are legitimately not top-level menu categories (special
// collections + the catch-all), so they're never flagged as menu-less.
const NON_MENU_OK = ['Sale', 'New', 'Featured', 'Kirkland Signature', 'ks_all', 'BuyersPick', 'General', 'Uncategorized', 'Everything'];

// The product field that holds its Costco category code (set by the scraper).
const codeOf = (p) => p.categoryCode || p.targetCode || (typeof p.category === 'string' && p.category.startsWith('cos_') ? p.category : null);

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

        // Flag a product as menu-less only when its CODE isn't a real menu code.
        // Products with no code at all are counted under 'Uncategorized'.
        const code = codeOf(p);
        if (!code) {
            unknownCats['(no code)'] = (unknownCats['(no code)'] || 0) + 1;
        } else if (!MENU_CODES.includes(code) && !NON_MENU_OK.includes(code)) {
            unknownCats[code] = (unknownCats[code] || 0) + 1;
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
        console.log("\nℹ️  INFO: category codes NOT in the storefront menu (searchable but not browsable):");
        Object.keys(unknownCats)
            .sort((a, b) => unknownCats[b] - unknownCats[a])
            .forEach(c => {
                console.log(`  • ${c}: ${unknownCats[c]} items`);
            });
        console.log("  (To make any of these browsable, add it to src/data/menuData.js + the categories collection.)");
    } else {
        console.log("\n✅ All products map to a valid menu category code.");
    }
}

main().catch(console.error);
