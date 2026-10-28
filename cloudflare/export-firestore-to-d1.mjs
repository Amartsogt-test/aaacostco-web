/**
 * export-firestore-to-d1.mjs — read every Firestore collection and emit D1 seed SQL
 * files (cloudflare/seed/seed-<table>.sql). Run on your machine (needs Firestore creds),
 * then load each into D1:
 *
 *   node cloudflare/export-firestore-to-d1.mjs
 *   wrangler d1 execute costco --file=cloudflare/seed/seed-products.sql
 *   wrangler d1 execute costco --file=cloudflare/seed/seed-orders.sql      (etc.)
 *
 * Idempotent on D1: rows use INSERT OR REPLACE by primary key. Re-run any time to refresh.
 * Pairs with cloudflare/d1-schema.sql (apply the schema first).
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sa = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'functions', 'service-account.json'), 'utf8'));
initializeApp({ credential: cert(sa) });
const dbId = process.env.FIRESTORE_DATABASE_ID;
const db = dbId && dbId !== '(default)' ? getFirestore(dbId) : getFirestore();

const outDir = path.join(__dirname, 'seed');
fs.mkdirSync(outDir, { recursive: true });

// --- SQL helpers -------------------------------------------------------------
const q = (v) => {
  if (v === undefined || v === null) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? '1' : '0';
  return `'${String(v).replace(/'/g, "''")}'`;            // escape single quotes
};
const j = (v) => (v === undefined || v === null ? 'NULL' : `'${JSON.stringify(v).replace(/'/g, "''")}'`);
const b = (v) => (v ? '1' : '0');

// Write INSERT OR REPLACE statements for `rows` (array of value-arrays) into a file,
// batched by byte size so no single statement exceeds D1's per-statement limit.
function writeTable(table, columns, rows) {
  const f = path.join(outDir, `seed-${table}.sql`);
  if (!rows.length) { fs.writeFileSync(f, `-- no rows for ${table}\n`); console.log(`  ${table}: 0`); return; }
  const cols = columns.join(', ');
  const prefix = `INSERT OR REPLACE INTO ${table} (${cols}) VALUES\n`;
  let out = `-- ${rows.length} rows → ${table}\nPRAGMA foreign_keys=OFF;\n`;
  // Batch by BYTE SIZE (not row count): keep each INSERT statement well under D1's
  // per-statement limit, so big-text rows (product HTML descriptions) don't blow up.
  const MAX = 45000;
  let buf = [], bufLen = 0;
  const flush = () => { if (buf.length) { out += prefix + buf.join(',\n') + ';\n'; buf = []; bufLen = 0; } };
  for (const r of rows) {
    const v = `(${r.join(', ')})`;
    if (buf.length && bufLen + v.length > MAX) flush();   // close the current statement first
    buf.push(v); bufLen += v.length + 2;
  }
  flush();
  fs.writeFileSync(f, out);
  console.log(`  ${table}: ${rows.length}`);
}

const getAll = async (col) => (await db.collection(col).get()).docs;

// --- per-collection exporters ------------------------------------------------
async function run() {
  const includeTransactional = process.argv.includes('--include-transactional') || process.argv.includes('--all');
  console.log(`Exporting Firestore → D1 seed SQL (${includeTransactional ? 'ALL tables' : 'catalog & settings only — pass --include-transactional for orders/users/chats'})...`);

  // products
  {
    const docs = await getAll('products');
    const cols = ['id','name','name_mn','englishName','brand','code','image','price','originalPrice',
      'estimatedWarehousePrice','estimatedMarkupKrw','hasDiscount','hidePriceValue','priceFromWarehouse',
      'status','categoryCode','targetCode','weight','barcode','stock','shortDescription','description',
      'description_mn','ratingsAvg','reviewCount','restricted','restrictedNote','specifications',
      'additionalCategories','categoryPath','images','lastScraped','createdAt','updatedAt'];
    writeTable('products', cols, docs.map((d) => { const p = d.data();
      const price = (p.price && typeof p.price === 'object') ? p.price.value : (p.price ?? p.priceKRW ?? 0);
      const origPrice = (p.originalPrice && typeof p.originalPrice === 'object') ? p.originalPrice.value : (p.originalPrice ?? p.originalPriceKRW ?? 0);
      const weight = p.weight ?? p.weightKg ?? p.aiWeight ?? null;
      return [q(d.id),q(p.name),q(p.name_mn),q(p.englishName),q(p.brand),q(p.code||d.id),q(p.image),
        q(Number(price)||0),q(Number(origPrice)||0),q(Number(p.estimatedWarehousePrice)||0),
        q(Number(p.estimatedMarkupKrw)||0),b(p.hasDiscount),b(p.hidePriceValue),b(p.priceFromWarehouse),
        q(p.status||'active'),q(p.categoryCode||p.category||p.mainCategory),q(p.targetCode),q(weight),q(p.barcode),
        q(p.stock||p.stockStatus),q(p.shortDescription||p.summary),q(p.description),q(p.description_mn),q(Number(p.ratingsAvg ?? p.rating)||0),
        q(Number(p.reviewCount)||0),b(p.restricted),q(p.restrictedNote),j(p.specifications),
        j(p.additionalCategories),j(p.categoryPath||p.categories),j(p.images),q(p.lastScraped),q(p.createdAt),q(p.updatedAt)];
    }));
  }

  // simple catalog tables
  const simple = async (col, table, map, cols) => writeTable(table, cols, (await getAll(col)).map(map));
  await simple('categories', 'categories', (d) => { const c = d.data();
    return [q(d.id),q(c.label),q(c.url),q(c.imageUrl),q(c.banner),j(c.subcategories),q(c.updatedAt)]; },
    ['id','label','url','imageUrl','banner','subcategories','updatedAt']);

  // key/value JSON tables
  const kv = async (col, table) => writeTable(table, ['id','data','updatedAt'],
    (await getAll(col)).map((d) => [q(d.id), j(d.data()), q(d.data()?.updatedAt)]));
  await kv('settings', 'settings');
  await kv('system', 'system');
  // reports/manifests (id + JSON, no updatedAt col)
  for (const [col, table] of [['daily_reports','daily_reports'],['dailyManifests','daily_manifests']]) {
    writeTable(table, ['id','data'], (await getAll(col)).map((d) => [q(d.id), j(d.data())]));
  }

  if (includeTransactional) {
    // orders + order_items
    {
      const docs = await getAll('orders');
      const oCols = ['id','userId','customer','customerEmail','recipientName','recipientPhone','recipientPhone2',
        'recipientRegister','recipientCustomsAddress','recipientAddress','deliveryMode','branch','deliveryFee',
        'total','amountPaid','paymentFee','currency','paymentMethod','couponCode','couponDiscount','tierDiscount',
        'pointsRedeemedKRW','pointsDiscount','launchSale','pointsCredited','pointsCreditedKRW','status',
        'trackingStage','trackingHistory','priceAudit','shipmentGroup','qpay','wire','returnRequest',
        'brokerageConsent','deliveryLocation','createdAt','date'];
      const items = [];
      const oRows = docs.map((d) => { const o = d.data();
        (o.items || []).forEach((it) => items.push([q(d.id),q(it.id),q(it.name),q(Number(it.price)||0),
          q(Number(it.quantity)||1),q(it.image),q(it.shippingMethod||'ground'),j(it.selectedOptions)]));
        return [q(d.id),q(o.userId),q(o.customer),q(o.customerEmail),q(o.recipientName),q(o.recipientPhone),
          q(o.recipientPhone2),q(o.recipientRegister),q(o.recipientCustomsAddress),q(o.recipientAddress),
          q(o.deliveryMode),q(o.branch),q(Number(o.deliveryFee)||0),q(Number(o.total)||0),q(Number(o.amountPaid)||0),
          q(Number(o.paymentFee)||0),q(o.currency||'MNT'),q(o.paymentMethod),q(o.couponCode),q(Number(o.couponDiscount)||0),
          q(Number(o.tierDiscount)||0),q(Number(o.pointsRedeemedKRW)||0),q(Number(o.pointsDiscount)||0),b(o.launchSale),
          b(o.pointsCredited),q(Number(o.pointsCreditedKRW)||0),q(o.status),q(o.trackingStage||'received'),
          j(o.trackingHistory),j(o.priceAudit),q(o.shipmentGroup),j(o.qpay),j(o.wire),j(o.returnRequest),
          b(o.brokerageConsent),j(o.deliveryLocation),q(o.createdAt),q(o.date)];
      });
      writeTable('orders', oCols, oRows);
      writeTable('order_items', ['order_id','product_id','name','price','quantity','image','shippingMethod','selectedOptions'], items);
    }

    // users
    {
      const docs = await getAll('users');
      writeTable('users', ['uid','phone','name','email','isAdmin','loginProvider','registrationMethod',
        'loyaltyPointsKRW','loyaltyLots','totalSpendKRW','tier','followStatus','createdAt','lastLogin'],
        docs.map((d) => { const u = d.data(); return [q(d.id),q(u.phone),q(u.name),q(u.email),b(u.isAdmin),
          q(u.loginProvider),q(u.registrationMethod),q(Number(u.loyaltyPointsKRW)||0),j(u.loyaltyLots),
          q(Number(u.totalSpendKRW)||0),q(u.tier||'Silver'),j(u.followStatus),q(u.createdAt),q(u.lastLogin)]; }));
    }

    await simple('coupons', 'coupons', (d) => { const c = d.data();
      return [q(d.id),b(c.active!==false),q(c.type),q(Number(c.value)||0),q(Number(c.minOrderMNT)||0),
        q(c.cap??null),q(Number(c.used)||0),q(c.expiresAt)]; },
      ['code','active','type','value','minOrderMNT','cap','used','expiresAt']);
    await simple('reviews', 'reviews', (d) => { const r = d.data();
      return [q(d.id),q(r.productId),q(r.userId),q(Number(r.rating)||0),q(r.text),q(r.createdAt)]; },
      ['id','productId','userId','rating','text','createdAt']);
    await simple('carts', 'carts', (d) => { const c = d.data();
      return [q(d.id),j(c.items),q(c.updatedAt)]; }, ['userId','items','updatedAt']);

    // chats + messages (subcollection)
    {
      const chats = await getAll('chats');
      const cRows = [], mRows = [];
      for (const d of chats) { const c = d.data();
        cRows.push([q(d.id),q(c.userId),q(c.userName),q(c.lastMessage),q(c.lastMessageAt),
          q(Number(c.unreadByAdmin)||0),q(Number(c.unreadByUser)||0),b(c.needsAdmin),q(c.createdAt)]);
        const msgs = await db.collection('chats').doc(d.id).collection('messages').get();
        msgs.forEach((m) => { const x = m.data();
          mRows.push([q(d.id),q(x.text),b(x.isFromAdmin),q(x.createdAt),b(x.read),b(x.pinned),b(x.liked)]); });
      }
      writeTable('chats', ['id','userId','userName','lastMessage','lastMessageAt','unreadByAdmin','unreadByUser','needsAdmin','createdAt'], cRows);
      writeTable('messages', ['chat_id','text','isFromAdmin','createdAt','read','pinned','liked'], mRows);
    }
  }

  console.log(`\nDone → ${outDir}\nLoad with: wrangler d1 execute costco --file=cloudflare/seed/seed-<table>.sql`);
  process.exit(0);
}
run().catch((e) => { console.error('FAILED:', e); process.exit(1); });
