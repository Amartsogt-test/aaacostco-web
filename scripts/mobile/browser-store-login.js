/**
 * Interactive & Persistent Browser Store Uploader
 * (scripts/mobile/browser-store-login.js)
 *
 * Opens a persistent Chromium browser profile (`logs/store-browser-profile`)
 * to Google Play Console (`https://play.google.com/console`) and
 * Apple App Store Connect (`https://appstoreconnect.apple.com`).
 *
 * Once logged in once, the session is saved in `logs/store-browser-profile`
 * so Playwright can automate creating the app, filling in the Mongolian/English
 * store listings, uploading icons/screenshots, and uploading `Costco Mongolia.aab`.
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const PROFILE_DIR = path.join(ROOT_DIR, 'logs', 'store-browser-profile');

async function main() {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
    console.log('🌐 [Store Browser] Opening persistent browser for Google Play Console & App Store Connect...');
    console.log(`📂 [Store Browser] Session profile saved at: ${PROFILE_DIR}`);

    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
        headless: false,
        viewport: { width: 1366, height: 860 },
        args: ['--disable-blink-features=AutomationControlled'],
    });

    const playPage = context.pages()[0] || (await context.newPage());
    await playPage.goto('https://play.google.com/console', { waitUntil: 'domcontentloaded' });

    const applePage = await context.newPage();
    await applePage.goto('https://appstoreconnect.apple.com', { waitUntil: 'domcontentloaded' });

    console.log('✅ [Store Browser] Google Play Console & App Store Connect tabs are open.');
}

main();
