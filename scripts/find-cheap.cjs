// Find very cheap / recently-created test products.
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, '..', 'functions', 'service-account.json'))) });
const db = admin.firestore();

(async () => {
    const snap = await db.collection('products').where('price', '<=', 1000).where('price', '>', 0).get();
    console.log(`Products with price <= 1000₩: ${snap.size}\n`);
    const rows = [];
    snap.forEach((d) => {
        const p = d.data() || {};
        rows.push({ id: d.id, price: p.price, status: p.status, name: (p.name_mn || p.name || '').slice(0, 40), created: p.createdAt || p.date || '' });
    });
    rows.sort((a, b) => String(b.created).localeCompare(String(a.created)));
    rows.forEach((r) => console.log(`  ${r.id}  ₩${r.price}  [${r.status}]  ${r.name}  ${r.created}`));
    process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
