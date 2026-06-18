/**
 * 🧰 maintenance.cjs — the ONE post-sync maintenance pass.
 *
 * Run AFTER the full sync (npm run core:daily). It does two robust, admin-SDK tasks:
 *
 *   1) WAREHOUSE FALLBACK — products whose online price Costco hides (hidePriceValue)
 *      but which have a stored warehouse price get  price = estimatedWarehousePrice
 *      (flagged priceFromWarehouse). Candidate ids come from the search index (p<=0, w>0);
 *      the warehouse value is read from the product doc, so it never lowers a real price.
 *
 *   2) MARK MISSING → INACTIVE — every sync stamps lastScraped on the products it sees.
 *      Active products not scraped for >--days (default 14) are gone from Costco → set
 *      status 'inactive' (never deleted). Safety brake: aborts task 2 if it would flip
 *      more than MAX_INACTIVATE (that means the sync only ran partially).
 *
 * Requirements: functions/service-account.json.
 * Usage:
 *   node scripts/maintenance.cjs                 # do both, apply
 *   node scripts/maintenance.cjs --dry           # preview, write nothing
 *   node scripts/maintenance.cjs --days 21
 *   node scripts/maintenance.cjs --only warehouse | --only inactive
 */
const path = require('path');
const fs = require('fs');

const adminPath = path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin');
const admin = require(adminPath);
const saPath = path.join(__dirname, '..', 'functions', 'service-account.json');
if (!fs.existsSync(saPath)) { console.error('❌ functions/service-account.json not found.'); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(require(saPath)) });
const db = admin.firestore();

const arg = (flag, def = null) => { const i = process.argv.indexOf(flag); return i > -1 ? (process.argv[i + 1] ?? true) : def; };
const DRY = process.argv.includes('--dry');
const ONLY = arg('--only');                  // 'warehouse' | 'inactive' | null (=both)
const DAYS = Number(arg('--days', 14));
const INDEX_URL = process.env.SEARCH_INDEX_URL || 'https://costco-fe034.web.app/search-index.json';
const MAX_INACTIVATE = 2500;

const priceOf = (d) => Number((d.price && typeof d.price === 'object') ? d.price.value : d.price) || 0;

// --- Task 1: warehouse-price fallback ---------------------------------------
async function warehouseFallback() {
    console.log('\n=== 1) Warehouse-price fallback ===');
    // Prefer the FRESH local index that core:daily just rebuilt; fall back to the
    // deployed one only if the local file is missing. (The deployed index is last
    // week's, so using it here makes candidate detection stale.)
    let idx;
    const localIdx = path.join(__dirname, '..', 'public', 'search-index.json');
    if (fs.existsSync(localIdx)) {
        console.log('Using fresh local index:', localIdx);
        idx = JSON.parse(fs.readFileSync(localIdx, 'utf8'));
    } else {
        console.log('Local index not found — using deployed:', INDEX_URL);
        idx = await fetch(INDEX_URL + '?ts=' + Date.now()).then((r) => r.json());
    }
    const arr = Array.isArray(idx) ? idx : (idx.items || idx.products || []);
    const ids = arr
        .filter((p) => p.s !== 'deleted' && !(Number(p.p) > 0) && Number(p.w) > 0)
        .map((p) => p.id).filter(Boolean);
    console.log(`Candidates (no price, has warehouse): ${ids.length}`);
    if (ids.length === 0) return;

    let set = 0;
    for (let i = 0; i < ids.length; i += 300) {
        const snaps = await db.getAll(...ids.slice(i, i + 300).map((id) => db.collection('products').doc(id)));
        let batch = db.batch();
        let pending = 0;
        for (const snap of snaps) {
            if (!snap.exists) continue;
            const d = snap.data() || {};
            const warehouse = Number(d.estimatedWarehousePrice) || 0;
            if (priceOf(d) > 0 || warehouse <= 0 || d.status === 'deleted') continue;
            if (!DRY) {
                batch.update(snap.ref, {
                    price: warehouse, originalPrice: warehouse, hasDiscount: false,
                    priceFromWarehouse: true, lastFixed: admin.firestore.FieldValue.serverTimestamp(),
                });
                pending++;
            }
            set++;
        }
        if (pending > 0) await batch.commit();
    }
    console.log(`${DRY ? '(DRY) would set' : 'Set'} warehouse price on ${set} products.`);
}

// --- Task 2: mark missing → inactive ----------------------------------------
async function markInactive() {
    console.log('\n=== 2) Mark missing → inactive ===');
    const cutoff = new Date(Date.now() - DAYS * 86400000).toISOString();
    console.log(`Cutoff: not scraped since ${cutoff} (>${DAYS} days).`);
    const snap = await db.collection('products').where('lastScraped', '<', cutoff).get();
    const refs = [];
    snap.forEach((doc) => { if ((doc.data() || {}).status === 'active') refs.push(doc.ref); });
    console.log(`Active products gone from Costco: ${refs.length}`);
    if (refs.length === 0) return;
    if (refs.length > MAX_INACTIVATE) {
        console.error(`❌ SKIP: ${refs.length} > safety cap ${MAX_INACTIVATE}. Sync likely ran partially — not inactivating.`);
        return;
    }
    if (DRY) { console.log(`(DRY) would mark ${refs.length} inactive.`); return; }
    let done = 0;
    for (let i = 0; i < refs.length; i += 400) {
        const batch = db.batch();
        for (const ref of refs.slice(i, i + 400)) {
            batch.update(ref, { status: 'inactive', inactivatedAt: admin.firestore.FieldValue.serverTimestamp(), inactiveReason: 'not-on-costco' });
        }
        await batch.commit();
        done += Math.min(400, refs.length - i);
    }
    console.log(`Marked ${done} products inactive.`);
}

(async () => {
    try {
        if (ONLY !== 'inactive') await warehouseFallback();
        if (ONLY !== 'warehouse') await markInactive();
        console.log('\n✅ Maintenance done.' + (DRY ? ' (DRY RUN — nothing written.)' : ''));
        process.exit(0);
    } catch (e) {
        console.error('❌ Maintenance failed:', e.message || e);
        process.exit(1);
    }
})();
