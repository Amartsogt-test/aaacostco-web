/**
 * build-home-snapshot.js — generate a STATIC home-page snapshot.
 *
 * Why: Firestore lives in a US region, so a visitor in Mongolia pays ~1–2.5s
 * per query on their FIRST visit (before any client cache exists). Firebase
 * Hosting, by contrast, is served from a global CDN with edge nodes near
 * Mongolia. By writing the home product list + category counts to a static
 * JSON file that ships with hosting, the very first paint reads a fast CDN file
 * instead of querying the far-away database. The app still refreshes from
 * Firestore in the background to stay current.
 *
 * Output: public/home-snapshot.json  (deployed as /home-snapshot.json)
 * Run as part of the daily sync:  npm run core:home-snapshot
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    || path.join(__dirname, '../../functions/service-account.json');
if (!fs.existsSync(serviceAccountPath)) {
    console.error('❌ No service account at', serviceAccountPath);
    process.exit(1);
}
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
// Target a region-local named database when FIRESTORE_DATABASE_ID is set (Asia migration).
const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || '(default)';
const db = FIRESTORE_DATABASE_ID === '(default)'
    ? admin.firestore()
    : require('firebase-admin/firestore').getFirestore(admin.app(), FIRESTORE_DATABASE_ID);

// Only the fields the home product GRID needs. Heavy fields (description,
// description_mn, specifications, classifications, images[]) are intentionally
// excluded — they're loaded on the product detail page — which keeps the
// snapshot small (~10x smaller) so it downloads fast on Mongolian mobile data.
const CARD_FIELDS = [
    'code', 'name', 'name_mn', 'name_en', 'englishName', 'brand',
    'image',
    'price', 'priceKRW', 'manualPriceKRW',
    'originalPrice', 'originalPriceKRW', 'oldPrice', 'baseOldPrice', 'manualOriginalPriceKRW',
    'estimatedWarehousePrice',
    'hasDiscount', 'discount', 'discountPercent', 'discountEndDate', 'discountEndsAt',
    'additionalCategories', 'category', 'categoryName', 'subCategory', 'subCategoryName',
    'status', 'stock', 'weight', 'sortOrder',
];

function pickCardFields(data, id) {
    const out = { id };
    for (const k of CARD_FIELDS) {
        if (data[k] !== undefined) out[k] = data[k];
    }
    out.price = data.price || data.priceKRW || 0;
    out.originalPrice = data.originalPrice || data.originalPriceKRW || 0;
    return out;
}

async function buildProducts() {
    // Mirror productService.getHomeProducts(): pre-sorted home_products collection.
    const snap = await db.collection('home_products').orderBy('sortOrder', 'asc').get();
    return snap.docs
        .filter((d) => d.id !== '__metadata__')
        .map((d) => pickCardFields(d.data(), d.id));
}

// Current KRW→MNT exchange rate, so first-visit MNT prices render correctly
// from the CDN without waiting for a Firestore read (otherwise prices briefly
// show as "unavailable" until the rate loads).
async function buildWonRate() {
    try {
        const doc = await db.collection('settings').doc('currency').get();
        const r = doc.exists ? Number(doc.data().wonRate) : 0;
        return Number.isFinite(r) && r > 0 ? r : null;
    } catch {
        return null;
    }
}

// Raw category documents (the app applies its own MENU_DATA merge + sort).
async function buildCategories() {
    const snap = await db.collection('categories').get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function buildCategoryCounts() {
    const productsRef = db.collection('products');
    const catsSnap = await db.collection('categories').get();
    const counts = {};

    await Promise.all(catsSnap.docs.map(async (c) => {
        const agg = await productsRef
            .where('status', '==', 'active')
            .where('categoryCode', '==', c.id)
            .count().get();
        counts[c.id] = agg.data().count;
    }));

    const specials = {
        Sale: 'Sale',
        New: 'New',
        Kirkland: 'Kirkland Signature',
        Featured: 'Featured',
    };
    await Promise.all(Object.entries(specials).map(async ([key, tag]) => {
        const agg = await productsRef
            .where('status', '==', 'active')
            .where('additionalCategories', 'array-contains', tag)
            .count().get();
        counts[key] = agg.data().count;
    }));

    return counts;
}

async function run() {
    console.log('🚀 Building home snapshot…');
    const [products, categoryCounts, categories, wonRate] = await Promise.all([
        buildProducts(), buildCategoryCounts(), buildCategories(), buildWonRate(),
    ]);

    const snapshot = {
        generatedAt: new Date().toISOString(),
        productCount: products.length,
        wonRate,
        categoryCounts,
        categories,
        products,
    };

    // Firestore Timestamps serialise oddly; JSON.stringify handles plain values,
    // and home_products fields are already primitives/strings, so this is safe.
    const outPath = path.join(__dirname, '../../public/home-snapshot.json');
    fs.writeFileSync(outPath, JSON.stringify(snapshot));
    const kb = (fs.statSync(outPath).size / 1024).toFixed(1);
    console.log(`✅ Wrote ${products.length} products + counts → public/home-snapshot.json (${kb} KB)`);
    process.exit(0);
}

run().catch((e) => { console.error('Fatal:', e); process.exit(1); });
