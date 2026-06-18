import { chromium } from 'playwright';
import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Setup Firebase Admin
try {
    const serviceAccount = JSON.parse(
        readFileSync(join(__dirname, '..', '..', 'functions', 'service-account.json'), 'utf8')
    );
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    }
} catch (e) {
    console.error("Firebase Init Error:", e);
    process.exit(1);
}

const db = admin.firestore();

// Require scraper logic
const scraper = require('../../functions/scraper.js');

(async () => {
    console.log('🔍 Checking for 0 price products...');
    
    // 1. Find 0 price active products
    // We check for any product with price = 0 that is not strictly deleted
    const snapshot = await db.collection('products')
        .where('price', '==', 0)
        .limit(1)
        .get();

    if (snapshot.empty) {
        console.log('✅ No 0 price products found. No need to open browser.');
        process.exit(0);
    }
    
    console.log('⚠️ 0 price products found! Launching browser to get cookies...');

    // 2. Launch browser with persistent context
    const userDataDir = join(__dirname, '..', '..', '.browser_data');
    
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false, // Must be false so user can login if needed
        viewport: { width: 1280, height: 720 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

    console.log('🌐 Navigating to Costco...');
    await page.goto('https://www.costco.co.kr');

    // Wait a bit to ensure cookies are loaded and page settles
    await page.waitForTimeout(5000);
    
    // Check if we are logged in by looking for JSESSIONID
    const cookies = await context.cookies();
    const session = cookies.find(c => c.name === 'JSESSIONID');
    
    if (!session) {
        console.log('✨ PLEASE LOG IN MANUALLY IN THE BROWSER WINDOW ✨');
        console.log('Script is waiting for login... (Will wait up to 2 minutes)');
        
        let loggedIn = false;
        page.on('request', request => {
            const url = request.url();
            if (url.includes('/rest/v2/') || url.includes('/users/current')) {
                const headers = request.headers();
                if (headers['authorization']) {
                    loggedIn = true;
                }
            }
        });
        
        // Wait up to 2 minutes for login
        for(let i=0; i<24; i++) {
            await page.waitForTimeout(5000);
            if (loggedIn) break;
        }
    } else {
        console.log('✅ Found existing session cookies!');
    }

    // Grab all cookies and UA
    const finalCookies = await context.cookies();
    const cookieString = finalCookies.map(c => `${c.name}=${c.value}`).join('; ');
    const ua = await page.evaluate(() => navigator.userAgent);

    // Save to Firestore
    await db.collection('settings').doc('scraper').set({
        cookie: cookieString,
        userAgent: ua,
        updatedAt: new Date().toISOString()
    }, { merge: true });

    console.log('💾 Cookies saved to database.');
    
    // We don't need the browser anymore
    await context.close();
    
    // 3. Run the fix logic
    console.log('🚀 Running scraper.fixZeroPriceProducts()...');
    try {
        const result = await scraper.fixZeroPriceProducts(admin);
        console.log("Fix Result:", result);
    } catch (e) {
        console.error("Fix Error:", e);
    }

    process.exit(0);
})();
