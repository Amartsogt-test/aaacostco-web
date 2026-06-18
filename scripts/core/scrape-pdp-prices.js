/**
 * 🌐 Scrape prices straight off the product PAGE (PDP) for items whose price Costco
 * hides from the REST API (hidePriceValue=true). The PDP renders the price into a
 * structured <... itemprop="price" content="264900"> tag (Angular), so we need a real
 * browser + a logged-in MEMBER session — a plain HTTP fetch won't see it.
 *
 * By default it targets products with NO sell price AND NO warehouse price (the ones the
 * warehouse fallback can't help). Use --all-zero to target every price<=0 item.
 *
 * Requirements: functions/service-account.json + Playwright. Opens a headful browser;
 * log into costco.co.kr if prompted (the price only shows to members).
 *
 * Usage:
 *   node scripts/core/scrape-pdp-prices.js
 *   node scripts/core/scrape-pdp-prices.js --limit 50
 *   node scripts/core/scrape-pdp-prices.js --all-zero      # every price<=0 product
 */
import { chromium } from 'playwright';
import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const saPath = join(__dirname, '..', '..', 'functions', 'service-account.json');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(saPath, 'utf8'))) });
const db = admin.firestore();

const INDEX_URL = process.env.SEARCH_INDEX_URL || 'https://costco-fe034.web.app/search-index.json';
const ALL_ZERO = process.argv.includes('--all-zero');
const limArg = process.argv.indexOf('--limit');
const LIMIT = limArg > -1 ? Number(process.argv[limArg + 1]) : Infinity;

(async () => {
    // 1) Target ids from the search index.
    console.log(`Fetching index: ${INDEX_URL}`);
    const idx = await fetch(INDEX_URL + '?ts=' + Date.now()).then((r) => r.json());
    const arr = Array.isArray(idx) ? idx : (idx.items || idx.products || []);
    let ids = arr
        .filter((p) => p.s !== 'deleted' && !(Number(p.p) > 0) && (ALL_ZERO || !(Number(p.w) > 0)))
        .map((p) => p.id).filter(Boolean);
    if (LIMIT < ids.length) ids = ids.slice(0, LIMIT);
    console.log(`Targets: ${ids.length} (${ALL_ZERO ? 'all price<=0' : 'no price AND no warehouse'})\n`);
    if (ids.length === 0) { console.log('Nothing to do.'); process.exit(0); }

    // 2) Logged-in browser (persistent so the member session is reused).
    const userDataDir = join(__dirname, '..', '..', '.browser_data');
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        viewport: { width: 1280, height: 800 },
    });
    const page = context.pages()[0] || (await context.newPage());

    await page.goto('https://www.costco.co.kr');
    await page.waitForTimeout(4000);
    const session = (await context.cookies()).find((c) => c.name === 'JSESSIONID');
    if (!session) {
        console.log('✨ Costco-д ГИШҮҮНЭЭРЭЭ нэвтэрнэ үү (2 минут хүлээнэ)...');
        for (let i = 0; i < 24; i++) {
            await page.waitForTimeout(5000);
            if ((await context.cookies()).find((c) => c.name === 'JSESSIONID')) break;
        }
    } else {
        console.log('✅ Session cookie found.');
    }

    // 3) Visit each PDP and read itemprop="price".
    let fixed = 0;
    for (let i = 0; i < ids.length; i++) {
        const code = ids[i];
        let price = 0;
        try {
            const url = await page.evaluate(
                (c) => fetch('/rest/v2/korea/products/' + c + '?fields=url', { headers: { Accept: 'application/json' } })
                    .then((r) => r.json()).then((j) => j.url).catch(() => null),
                code
            );
            if (!url) { console.log(`[${i + 1}/${ids.length}] ${code}: no url`); continue; }

            await page.goto('https://www.costco.co.kr' + url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForSelector('[itemprop=price]', { timeout: 12000 }).catch(() => null);
            price = await page.evaluate(() => {
                const el = document.querySelector('[itemprop=price]');
                return el ? Number(el.getAttribute('content')) || 0 : 0;
            });
        } catch (e) {
            console.log(`[${i + 1}/${ids.length}] ${code}: error ${e.message.slice(0, 40)}`);
        }

        if (price > 0) {
            await db.collection('products').doc(code).update({
                price,
                originalPrice: price,
                hasDiscount: false,
                pdpPrice: true,
                lastFixed: admin.firestore.FieldValue.serverTimestamp(),
            }).catch(() => {});
            fixed++;
            console.log(`[${i + 1}/${ids.length}] ${code}: ${price.toLocaleString()}₩ ✓`);
        } else {
            console.log(`[${i + 1}/${ids.length}] ${code}: no price on PDP`);
        }
        await page.waitForTimeout(800); // be gentle
    }

    await context.close();
    console.log(`\n✅ Done. Set a price on ${fixed}/${ids.length} via PDP.`);
    console.log('Next: npm run core:search-index  &&  firebase deploy --only hosting');
    process.exit(0);
})();
