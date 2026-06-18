
import { chromium } from 'playwright';
import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

(async () => {
    console.log('🚀 Launching browser (persistent profile — login is remembered)...');
    // Persistent context: reuse the same .browser_data profile as the other scrapers,
    // so once you log into Costco the session is remembered and you are NOT asked again.
    const userDataDir = join(__dirname, '..', '..', '.browser_data');
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 720 }
    });
    const page = context.pages()[0] || await context.newPage();

    console.log('🌐 Navigating to Costco Login...');
    await page.goto('https://www.costco.co.kr/login');

    console.log('✨ PLEASE LOG IN MANUALLY IN THE BROWSER WINDOW ✨');
    console.log('Script will NOT close automatically. Please close the browser window when you are done.');

    // Sniff requests. IMPORTANT: only treat the session as a real MEMBER login when we see
    // a call to /rest/v2/korea/users/<EMAIL>/ — a guest/anonymous browser also has a
    // JSESSIONID and an (anonymous) Authorization token, which is why the old check saved a
    // not-logged-in cookie before the user even signed in.
    let capturedAuthToken = '';
    let capturedCSRF = '';
    let memberEmail = '';

    page.on('request', request => {
        const url = request.url();
        if (url.includes('/rest/v2/')) {
            const headers = request.headers();
            if (headers['authorization']) capturedAuthToken = headers['authorization'];
            if (headers['x-csrf-token']) capturedCSRF = headers['x-csrf-token'];
            // Real logged-in member → /users/<urlencoded-email>/...
            const m = url.match(/\/rest\/v2\/korea\/users\/([^/?]+)/);
            if (m) {
                const u = decodeURIComponent(m[1]);
                if (u.includes('@') && u !== 'anonymous' && u !== 'current') memberEmail = u;
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

            // Save ONLY after a real member login (member email seen) with a session cookie.
            if (memberEmail && session && !saved) {
                console.log(`✅ Logged in as ${memberEmail} — saving credentials...`);

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

    // Keep process alive until the browser window is closed (persistent context emits 'close').
    context.on('close', () => {
        console.log('Browser closed.');
        process.exit(0);
    });

})();
