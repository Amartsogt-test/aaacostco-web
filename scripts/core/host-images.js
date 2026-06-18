/**
 * host-images.js — Self-host product images.
 *
 * Costco Korea images are hotlinked (slow, unresized, and dependent on their
 * origin staying up). This backfill downloads each product's source image,
 * resizes it to a sensible width, converts to WebP, uploads it to Firebase
 * Storage as a PUBLIC object, and rewrites product.image to the hosted URL.
 *
 * Design notes:
 *  - IDEMPOTENT & RESUMABLE: a product is skipped once product.image already
 *    points at our own storage bucket and product.sourceImage matches the
 *    current Costco URL. Re-running only processes new/changed images.
 *  - SAFE: the original Costco URL is preserved in product.sourceImage, so we
 *    can always re-derive or fall back.
 *  - NO storage.rules / ACL CHANGE: each object is uploaded with a Firebase
 *    download token and served from the firebasestorage.googleapis.com URL.
 *    The token grants read access, so this works even on buckets with uniform
 *    bucket-level access enabled — no rules or IAM changes required.
 *
 * Run:  node scripts/core/host-images.js              (process all)
 *       node scripts/core/host-images.js --limit 50   (test on a few first)
 *       node scripts/core/host-images.js --force       (re-process everything)
 *
 * Requires: firebase-admin service account (same as the sync pipeline) and
 *           the `sharp` package (npm i -D sharp).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const admin = require('firebase-admin');
let sharp;
try {
    sharp = require('sharp');
} catch {
    console.error('❌ Missing dependency "sharp". Install it first:  npm i -D sharp');
    process.exit(1);
}

// ---- config ----
const TARGET_WIDTH = 500;   // px — covers product cards and detail view crisply
const WEBP_QUALITY = 80;
const STORAGE_PREFIX = 'product-images';
const CONCURRENCY = 6;      // parallel image jobs
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const LIMIT = (() => {
    const i = args.indexOf('--limit');
    return i >= 0 ? parseInt(args[i + 1], 10) : 0;
})();

// ---- init admin ----
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    || path.join(__dirname, '../../functions/service-account.json');
if (!fs.existsSync(serviceAccountPath)) {
    console.error('❌ No service account found at', serviceAccountPath);
    process.exit(1);
}
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET
            || `${serviceAccount.project_id}.appspot.com`,
    });
}
// Target a region-local named database when FIRESTORE_DATABASE_ID is set (Asia migration).
const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || '(default)';
const db = FIRESTORE_DATABASE_ID === '(default)'
    ? admin.firestore()
    : require('firebase-admin/firestore').getFirestore(admin.app(), FIRESTORE_DATABASE_ID);
const bucket = admin.storage().bucket();

const isCostcoSource = (url) => typeof url === 'string'
    && /costco\.co\.kr|costcojapan|\/medias\//.test(url);
const isAlreadyHosted = (url) => typeof url === 'string'
    && /storage\.googleapis\.com|firebasestorage\.googleapis\.com/.test(url);

async function processOne(doc) {
    const data = doc.data();
    const source = data.sourceImage && isCostcoSource(data.sourceImage)
        ? data.sourceImage
        : data.image;

    // Nothing to do: no source, or an admin-uploaded image that's not from Costco.
    if (!source || (!isCostcoSource(source) && !isCostcoSource(data.image))) {
        return 'skip-nosrc';
    }
    // Already hosted and source unchanged → skip (unless --force).
    if (!FORCE && isAlreadyHosted(data.image) && data.sourceImage === source) {
        return 'skip-done';
    }

    const costcoUrl = isCostcoSource(source) ? source : data.image;

    // 1. download
    const res = await fetch(costcoUrl, { redirect: 'follow' });
    if (!res.ok) throw new Error(`download ${res.status}`);
    const input = Buffer.from(await res.arrayBuffer());

    // 2. resize + webp
    const output = await sharp(input)
        .resize({ width: TARGET_WIDTH, withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();

    // 3. upload with a Firebase download token (works with uniform bucket-level access)
    const objectPath = `${STORAGE_PREFIX}/${doc.id}.webp`;
    const token = crypto.randomUUID();
    const file = bucket.file(objectPath);
    await file.save(output, {
        contentType: 'image/webp',
        resumable: false,
        metadata: {
            cacheControl: 'public, max-age=31536000, immutable',
            metadata: { firebaseStorageDownloadTokens: token },
        },
    });
    const hostedUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}`
        + `/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;

    // 4. rewrite product doc (preserve original)
    await doc.ref.update({
        image: hostedUrl,
        sourceImage: costcoUrl,
        imageHostedAt: new Date().toISOString(),
    });
    return 'hosted';
}

async function run() {
    console.log('🚀 host-images: scanning products…', FORCE ? '(FORCE)' : '', LIMIT ? `(limit ${LIMIT})` : '');
    let q = db.collection('products');
    const snap = await q.get();
    let docs = snap.docs;
    if (LIMIT) docs = docs.slice(0, LIMIT);
    console.log(`Found ${docs.length} products.`);

    const stats = { hosted: 0, 'skip-done': 0, 'skip-nosrc': 0, error: 0 };
    let idx = 0;

    async function worker() {
        while (idx < docs.length) {
            const myIdx = idx++;
            const doc = docs[myIdx];
            try {
                const r = await processOne(doc);
                stats[r] = (stats[r] || 0) + 1;
                if (r === 'hosted') console.log(`  ✓ [${myIdx + 1}/${docs.length}] ${doc.id}`);
            } catch (err) {
                stats.error++;
                console.warn(`  ✗ [${myIdx + 1}/${docs.length}] ${doc.id}: ${err.message}`);
            }
        }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    console.log('✅ Done.', JSON.stringify(stats));
    process.exit(0);
}

run().catch((e) => { console.error('Fatal:', e); process.exit(1); });
