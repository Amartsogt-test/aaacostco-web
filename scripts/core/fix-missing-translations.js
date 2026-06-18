/**
 * fix-missing-translations.js — one-time reconciliation.
 *
 * The translation step (scripts/core/translate.js) finds work via
 *   where('name_mn', '==', null)
 * which in Firestore only matches docs where name_mn is an EXPLICIT null — it
 * never matches docs where the field is entirely ABSENT. Products created before
 * the scraper started seeding `name_mn: null` therefore have no name_mn field at
 * all and silently never get translated.
 *
 * This script scans the whole products collection once and, for any product
 * missing a `name_mn` field, sets it to null so the normal translation step picks
 * it up on its next run. It is SAFE and IDEMPOTENT: products that already have a
 * translation (or an explicit null) are left untouched.
 *
 * Run:  node scripts/core/fix-missing-translations.js
 *       node scripts/core/fix-missing-translations.js --dry   (report only)
 *
 * Then run the translator:  npm run core:translate
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

const DRY = process.argv.slice(2).includes('--dry');

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    || path.join(__dirname, '../../functions/service-account.json');
if (!fs.existsSync(serviceAccountPath)) {
    console.error('❌ No service account found at', serviceAccountPath);
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

async function run() {
    console.log('🔎 Scanning products for missing name_mn…', DRY ? '(dry run)' : '');
    const snap = await db.collection('products').get();
    console.log(`   ${snap.size} products total.`);

    const missing = snap.docs.filter(d => !('name_mn' in d.data()));
    console.log(`   ${missing.length} products are missing the name_mn field.`);

    if (missing.length === 0) {
        console.log('✅ Nothing to fix — every product already has name_mn.');
        process.exit(0);
    }
    if (DRY) {
        console.log('   (dry run) Would seed name_mn=null on these so the translator catches them.');
        process.exit(0);
    }

    // Firestore batches are capped at 500 writes.
    const CHUNK = 450;
    let written = 0;
    for (let i = 0; i < missing.length; i += CHUNK) {
        const batch = db.batch();
        for (const doc of missing.slice(i, i + CHUNK)) {
            batch.update(doc.ref, { name_mn: null });
        }
        await batch.commit();
        written += Math.min(CHUNK, missing.length - i);
        console.log(`   …seeded ${written}/${missing.length}`);
    }
    console.log('✅ Done. Now run:  npm run core:translate');
    process.exit(0);
}

run().catch((e) => { console.error('Fatal:', e); process.exit(1); });
