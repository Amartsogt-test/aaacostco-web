/**
 * 🧩 add-menu-categories.cjs — make a few Costco category codes that the catalog
 * already carries (but the storefront menu never listed) browsable.
 *
 * Background: products store their top-level Costco category in `categoryCode`
 * (e.g. cos_19 = tires). The storefront menu is driven by the Firestore
 * `categories` collection (one doc per code) + src/data/menuData.js (icon/label).
 * A few codes — cos_19 (tires), cos_17 (innerwear), cos_21 (car batteries) — have
 * products but NO categories doc, so they can't be browsed (only searched).
 *
 * This script, for each target code:
 *   1) creates/updates a `categories/{code}` doc (label + empty subcategories),
 *   2) ensures every product with that categoryCode has the code in its
 *      `categoryPath` array (browse filters by `categoryPath array-contains`),
 *      using arrayUnion so it's idempotent and never removes anything.
 *
 * SAFE: additive only. No deletes, no price/status writes. Re-runnable.
 * After running: `npm run core:search-index` (counts) then deploy hosting,
 * and add the matching MENU_DATA entries in src/data/menuData.js (icon/label).
 *
 * Usage:
 *   node scripts/add-menu-categories.cjs            # apply
 *   node scripts/add-menu-categories.cjs --dry      # preview only
 */
const path = require('path');
const fs = require('fs');

const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
const saPath = path.join(__dirname, '..', 'functions', 'service-account.json');
if (!fs.existsSync(saPath)) { console.error('❌ functions/service-account.json not found.'); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(require(saPath)) });
const db = admin.firestore();

const DRY = process.argv.includes('--dry');

// Code → Mongolian label. Edit labels here if you prefer different wording.
const TARGETS = {
    cos_19: 'Дугуй (Авто)',
    cos_17: 'Дотуур хувцас',
    cos_21: 'Авто аккумулятор',
};

async function run() {
    for (const [code, label] of Object.entries(TARGETS)) {
        console.log(`\n=== ${code} — ${label} ===`);

        // 1) categories/{code} doc — so the menu lists & counts it.
        if (!DRY) {
            await db.collection('categories').doc(code).set({
                label,
                url: `https://www.costco.co.kr/c/${code}`,
                subcategories: [],
                updatedAt: new Date().toISOString(),
                addedByScript: true,
            }, { merge: true });
        }
        console.log(`  ${DRY ? '(DRY) would create' : 'Created'} categories/${code}`);

        // 2) Backfill categoryPath on every product carrying this categoryCode.
        const snap = await db.collection('products').where('categoryCode', '==', code).get();
        console.log(`  Products with categoryCode=${code}: ${snap.size}`);
        let patched = 0;
        const docs = snap.docs;
        for (let i = 0; i < docs.length; i += 400) {
            const batch = db.batch();
            let pending = 0;
            for (const d of docs.slice(i, i + 400)) {
                const data = d.data() || {};
                const pathArr = Array.isArray(data.categoryPath) ? data.categoryPath : [];
                if (pathArr.includes(code)) continue; // already browsable
                if (!DRY) {
                    batch.update(d.ref, { categoryPath: admin.firestore.FieldValue.arrayUnion(code) });
                    pending++;
                }
                patched++;
            }
            if (pending > 0) await batch.commit();
        }
        console.log(`  ${DRY ? '(DRY) would add' : 'Added'} code to categoryPath on ${patched} products.`);
    }
    console.log(`\n✅ Done.${DRY ? ' (DRY RUN — nothing written.)' : ' Next: npm run core:search-index, add MENU_DATA entries, deploy hosting.'}`);
    process.exit(0);
}

run().catch((e) => { console.error('❌ Failed:', e.message || e); process.exit(1); });
