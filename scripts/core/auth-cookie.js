
import { chromium } from 'playwright';
import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Setup Firebase Admin
try {
    const serviceAccount = JSON.parse(
        readFileSync(join(__dirname, '..', 'functions', 'service-account.json'), 'utf8')
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

(async () => {
    console.log('🚀 Launching browser...');
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 720 }
    });
    const page = await context.newPage();

    console.log('🌐 Navigating to Costco Login...');
    await page.goto('https://www.costco.co.kr/login');

    console.log('✨ PLEASE LOG IN MANUALLY IN THE BROWSER WINDOW ✨');
    console.log('Script will NOT close automatically. Please close the browser window when you are done.');

    // Sniff for Authorization header
    let capturedAuthToken = '';
    let capturedCSRF = '';

    page.on('request', request => {
        const url = request.url();
        if (url.includes('/rest/v2/') || url.includes('/users/current')) {
            const headers = request.headers();
            if (headers['authorization']) {
                capturedAuthToken = headers['authorization'];
                // console.log('🎯 Captured Authorization Header!');
            }
            if (headers['x-csrf-token']) {
                capturedCSRF = headers['x-csrf-token'];
            }
        }
    });

    let saved = false;

    // Check periodically
    const interval = setInterval(async () => {
        try {
            if (page.isClosed()) {
                clearInterval(interval);
                console.log('Browser closed.');
                process.exit(0);
                return;
            }

            const cookies = await context.cookies();
            const session = cookies.find(c => c.name === 'JSESSIONID');
            // const segment = cookies.find(c => c.name === 'context_segment');

            // We want to save if we have Auth Token OR (Session + Context)
            if ((capturedAuthToken || (session && cookies.length > 5)) && !saved) {
                // Debounce slightly to ensure we have the latest
                if (capturedAuthToken) console.log('🎯 Got Authorization Token!');

                console.log('✅ Login/Activity detected! Saving credentials...');

                const cookieString = cookies
                    .map(c => `${c.name}=${c.value}`)
                    .join('; ');

                const ua = await page.evaluate(() => navigator.userAgent);

                await db.collection('settings').doc('scraper').set({
                    cookie: cookieString,
                    authorization: capturedAuthToken,
                    csrfToken: capturedCSRF,
                    userAgent: ua,
                    updatedAt: new Date().toISOString()
                }, { merge: true });

                console.log('🎉 CREDENTIALS SAVED!');
                if (capturedAuthToken) console.log(`Token: ${capturedAuthToken.substring(0, 20)}...`);
                console.log('You can close the browser now.');
                saved = true;
            }
        } catch {
            // Ignore context errors if closing
        }
    }, 2000);

    // Keep process alive until browser closed
    browser.on('disconnected', () => {
        console.log('Browser disconnected.');
        process.exit(0);
    });

})();
