/**
 * scripts/core/sync.js — Unified Costco.co.kr Catalog Sync Entrypoint.
 *
 * 1. Always runs the direct Costco.co.kr OCC REST API full catalog sync
 *    (`scripts/core/costco-kr-full-sync.js`), updating `public/home-snapshot.json`
 *    and `public/search-index.json` across all 18 categories + 4 special collections.
 * 2. If `functions/service-account.json` is present, also syncs to Firestore.
 */

import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runCostcoKrCatalogSync } from './costco-kr-full-sync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

async function run() {
    console.log('🚀 [Sync] Starting Costco.co.kr Full Catalog Sync...');
    const isQuick = process.argv.includes('--mode=quick');
    const summary = await runCostcoKrCatalogSync({ maxPagesPerCategory: isQuick ? 1 : 5 });
    console.log('✅ [Sync] Direct Costco.co.kr Catalog Sync Complete:', summary.totalActiveCatalog, 'active products.');

    const serviceAccountPath =
        process.env.GOOGLE_APPLICATION_CREDENTIALS ||
        path.join(__dirname, '../../functions/service-account.json');

    if (fs.existsSync(serviceAccountPath)) {
        try {
            const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
            const admin = require('firebase-admin');
            const scraper = require('../../functions/scraper.js');
            if (!admin.apps.length) {
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount),
                });
            }
            const result = await scraper.syncSpecialCategories(admin);
            console.log('✅ [Sync] Firestore Special Categories Sync Complete:', result?.saved || 0);
        } catch (err) {
            console.warn('⚠️ [Sync] Optional Firestore sync skipped:', err.message);
        }
    }
}

run();
