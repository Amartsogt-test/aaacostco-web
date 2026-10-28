/**
 * Autonomous Costco.co.kr Member Session & OAuth2 Token Manager
 * (scripts/core/auth-cookie.js)
 *
 * Ensures that all Costco Korea (`costco.co.kr`) API calls have BOTH:
 *   1. Valid Member Session Cookies (`JSESSIONID`, `SF_SESSION_ID`, `context_segment=GOLD_EXECUTIVE`, `device-id`)
 *   2. Valid SAP Commerce Cloud OAuth2 Bearer Token (`Authorization: bearer <token>`)
 *
 * Why both are required:
 *   Costco Korea hides prices (`hidePriceValue: true`, `price: undefined`) and restricts
 *   member-only products (`membershipRestrictionApplied: true`, e.g., Apple, Dyson, Samsung,
 *   Gold bars, Cosmetics) unless the request carries BOTH the member `Cookie` header AND
 *   the `Authorization: bearer <access_token>` header.
 *
 * Usage:
 *   node scripts/core/auth-cookie.js               # Auto headless login & verify member price visibility
 *   node scripts/core/auth-cookie.js --force       # Force fresh login even if cached session works
 *   node scripts/core/auth-cookie.js --interactive # Open visible browser window for manual login
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import dotenv from 'dotenv';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

dotenv.config({ path: path.join(ROOT_DIR, '.env.local') });
dotenv.config({ path: path.join(ROOT_DIR, 'scraper', '.env') });
dotenv.config();

const STATE_JSON_PATH = path.join(ROOT_DIR, 'state.json');
const SCRAPER_AUTH_JSON_PATH = path.join(ROOT_DIR, 'scraper', 'costco_auth.json');
const SESSION_CACHE_PATH = path.join(ROOT_DIR, 'logs', 'costco-member-session.json');
const DEFAULT_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// Known member-only hidden-price product on Costco Korea (Apple EarPods USB-C, hidePriceValue=true for guests)
const PROBE_PRODUCT_CODE = '676759';

/**
 * Verify if a `{ cookie, authorization, userAgent }` session can actually see hidden member prices.
 */
export async function verifyMemberSession(session) {
    if (!session?.cookie || !session?.authorization) return false;
    try {
        const res = await axios.get(
            `https://www.costco.co.kr/rest/v2/korea/products/${PROBE_PRODUCT_CODE}?fields=FULL&lang=ko&curr=KRW`,
            {
                headers: {
                    Accept: 'application/json',
                    Cookie: session.cookie,
                    Authorization: session.authorization,
                    'User-Agent': session.userAgent || DEFAULT_UA,
                },
                timeout: 12000,
            }
        );
        const priceVal = Number(res.data?.price?.value || 0);
        const isUnmasked = priceVal > 0 && res.data?.hidePriceValue === false;
        return isUnmasked;
    } catch {
        return false;
    }
}

/**
 * Optionally persist the refreshed session to Firestore `settings/scraper` if service-account.json exists.
 */
async function syncSessionToFirestoreIfPossible(session) {
    const saPath =
        process.env.GOOGLE_APPLICATION_CREDENTIALS ||
        path.join(ROOT_DIR, 'functions', 'service-account.json');
    if (!fs.existsSync(saPath)) return;

    try {
        const adminModule = await import('firebase-admin');
        const admin = adminModule.default || adminModule;
        const serviceAccount = JSON.parse(fs.readFileSync(saPath, 'utf8'));
        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
            });
        }
        const db = admin.firestore();
        await db.collection('settings').doc('scraper').set(
            {
                cookie: session.cookie,
                authorization: session.authorization,
                csrfToken: session.csrfToken || '',
                userAgent: session.userAgent || DEFAULT_UA,
                memberEmail: session.memberEmail || '',
                updatedAt: new Date().toISOString(),
            },
            { merge: true }
        );
    } catch {
        /* ignore optional Firestore write */
    }
}

/**
 * Perform automated Playwright member login using trusted `device-id` storage state
 * and `COSTCO_USER` / `COSTCO_PASS`.
 */
export async function loginCostcoMemberWithPlaywright({ interactive = false } = {}) {
    const email =
        process.env.COSTCO_USER ||
        process.env.COSTCO_KR_EMAIL ||
        process.env.COSTCO_EMAIL ||
        '';
    const password =
        process.env.COSTCO_PASS ||
        process.env.COSTCO_KR_PASSWORD ||
        process.env.COSTCO_PASSWORD ||
        '';

    if (!email || !password) {
        console.warn('⚠️ [Costco Auth] COSTCO_USER / COSTCO_PASS not found in .env.local or scraper/.env.');
        return null;
    }

    // Prefer state.json if it has device-id, otherwise scraper/costco_auth.json
    let storageStatePath = null;
    for (const candidate of [STATE_JSON_PATH, SCRAPER_AUTH_JSON_PATH]) {
        if (fs.existsSync(candidate)) {
            try {
                const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8'));
                if (Array.isArray(parsed.cookies) && parsed.cookies.some((c) => c.name === 'device-id')) {
                    storageStatePath = candidate;
                    break;
                }
            } catch {
                /* ignore */
            }
        }
    }

    let browser = null;
    try {
        console.log(
            `🔐 [Costco Auth] Launching ${interactive ? 'interactive' : 'headless'} browser to authenticate member (${email})...`
        );
        try {
            browser = await chromium.launch({
                headless: !interactive,
                channel: 'chrome',
                args: ['--disable-blink-features=AutomationControlled'],
            });
        } catch {
            browser = await chromium.launch({
                headless: !interactive,
                args: ['--disable-blink-features=AutomationControlled'],
            });
        }

        const contextOptions = {
            userAgent: DEFAULT_UA,
            viewport: { width: 1280, height: 800 },
        };
        if (storageStatePath) {
            contextOptions.storageState = storageStatePath;
        }

        const context = await browser.newContext(contextOptions);
        await context.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        const page = await context.newPage();
        let capturedAuth = '';
        let capturedCsrf = '';
        let memberEmail = email;

        page.on('request', (req) => {
            const url = req.url();
            if (url.includes('/rest/v2/')) {
                const headers = req.headers();
                if (headers.authorization) {
                    capturedAuth = headers.authorization;
                }
                if (headers['x-csrf-token']) {
                    capturedCsrf = headers['x-csrf-token'];
                }
                const m = url.match(/\/rest\/v2\/korea\/users\/([^/?]+)/);
                if (m) {
                    const u = decodeURIComponent(m[1]);
                    if (u.includes('@') && u !== 'anonymous' && u !== 'current') {
                        memberEmail = u;
                    }
                }
            }
        });

        page.on('response', async (res) => {
            if (res.url().includes('/identity/api/v1/sites/korea/identity/authentication')) {
                try {
                    const body = await res.json();
                    if (body?.oauth?.access_token) {
                        capturedAuth = `bearer ${body.oauth.access_token}`;
                    }
                } catch {
                    /* ignore */
                }
            }
        });

        // Step 1: Visit product probe page first to see if existing storageState is already logged in
        await page.goto(`https://www.costco.co.kr/p/${PROBE_PRODUCT_CODE}`, {
            waitUntil: 'domcontentloaded',
            timeout: 25000,
        }).catch(() => null);
        await page.waitForTimeout(3500);

        let currentCookies = await context.cookies();
        let cookieStr = currentCookies.map((c) => `${c.name}=${c.value}`).join('; ');

        let isAlreadyValid = false;
        if (capturedAuth && cookieStr.includes('context_segment')) {
            isAlreadyValid = await verifyMemberSession({
                cookie: cookieStr,
                authorization: capturedAuth,
                userAgent: DEFAULT_UA,
            });
        }

        // Step 2: If not yet authenticated, submit login form automatically
        if (!isAlreadyValid) {
            console.log('🔑 [Costco Auth] Submitting member credentials on https://www.costco.co.kr/login ...');
            await page.goto('https://www.costco.co.kr/login', {
                waitUntil: 'domcontentloaded',
                timeout: 25000,
            });
            await page.waitForSelector('#j_username', { timeout: 12000 }).catch(() => null);

            if ((await page.locator('#j_username').count()) > 0) {
                await page.locator('#j_username').fill(email);
                await page.locator('#j_password').fill(password);
                await page.locator('button.login-btn').click();
                await page.waitForTimeout(7000);
            }

            // Visit the probe product page so Spartacus attaches bearer token & context_segment cookie
            await page.goto(`https://www.costco.co.kr/p/${PROBE_PRODUCT_CODE}`, {
                waitUntil: 'domcontentloaded',
                timeout: 25000,
            }).catch(() => null);
            await page.waitForTimeout(4500);

            currentCookies = await context.cookies();
            cookieStr = currentCookies.map((c) => `${c.name}=${c.value}`).join('; ');
        }

        // Save storageState back to state.json so device-id and RememberMe cookies stay fresh
        await context.storageState({ path: STATE_JSON_PATH });
        await browser.close();
        browser = null;

        const session = {
            cookie: cookieStr,
            authorization: capturedAuth,
            csrfToken: capturedCsrf,
            userAgent: DEFAULT_UA,
            memberEmail,
            refreshedAt: new Date().toISOString(),
        };

        const verified = await verifyMemberSession(session);
        session.isAuthenticated = verified;

        const logsDir = path.dirname(SESSION_CACHE_PATH);
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
        fs.writeFileSync(SESSION_CACHE_PATH, JSON.stringify(session, null, 2), 'utf8');
        await syncSessionToFirestoreIfPossible(session);

        if (verified) {
            console.log(`✅ [Costco Auth] Member session verified! Hidden prices unlocked for ${memberEmail}.`);
        } else {
            console.warn('⚠️ [Costco Auth] Session saved, but hidden-price probe did not confirm member pricing.');
        }

        return session;
    } catch (err) {
        console.warn(`⚠️ [Costco Auth] Playwright login failed: ${err.message}`);
        if (browser) {
            await browser.close().catch(() => null);
        }
        return null;
    }
}

/**
 * High-level helper used by `costco-kr-full-sync.js`:
 * Returns a verified `{ cookie, authorization, userAgent, isAuthenticated }` object,
 * refreshing via Playwright only when the cached session is missing or expired.
 */
export async function ensureCostcoMemberSession({ forceRefresh = false, interactive = false } = {}) {
    // 1. Check cached session in logs/costco-member-session.json
    if (!forceRefresh && fs.existsSync(SESSION_CACHE_PATH)) {
        try {
            const cached = JSON.parse(fs.readFileSync(SESSION_CACHE_PATH, 'utf8'));
            const ok = await verifyMemberSession(cached);
            if (ok) {
                console.log(
                    `🔓 [Costco Auth] Reusing verified member session (${cached.memberEmail || 'member'}, refreshed ${cached.refreshedAt}).`
                );
                return { ...cached, isAuthenticated: true };
            }
            console.log('🔄 [Costco Auth] Cached member session expired; refreshing via Playwright...');
        } catch {
            /* ignore corrupt cache */
        }
    }

    // 2. Check environment variables if explicitly provided
    if (!forceRefresh && process.env.COSTCO_COOKIE && process.env.COSTCO_AUTH_TOKEN) {
        const envSession = {
            cookie: process.env.COSTCO_COOKIE,
            authorization: process.env.COSTCO_AUTH_TOKEN.startsWith('bearer ')
                ? process.env.COSTCO_AUTH_TOKEN
                : `bearer ${process.env.COSTCO_AUTH_TOKEN}`,
            userAgent: DEFAULT_UA,
            memberEmail: process.env.COSTCO_USER || 'env-member',
            refreshedAt: new Date().toISOString(),
        };
        if (await verifyMemberSession(envSession)) {
            return { ...envSession, isAuthenticated: true };
        }
    }

    // 3. Perform automatic Playwright login
    const freshSession = await loginCostcoMemberWithPlaywright({ interactive });
    if (freshSession) {
        return freshSession;
    }

    return {
        cookie: '',
        authorization: '',
        userAgent: DEFAULT_UA,
        isAuthenticated: false,
    };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    const forceRefresh = process.argv.includes('--force');
    const interactive = process.argv.includes('--interactive');
    ensureCostcoMemberSession({ forceRefresh, interactive })
        .then((session) => {
            console.log('📋 [Costco Auth] Status:', {
                isAuthenticated: session.isAuthenticated,
                memberEmail: session.memberEmail || null,
                cookieLength: (session.cookie || '').length,
                hasBearerToken: Boolean(session.authorization),
            });
            process.exit(session.isAuthenticated ? 0 : 1);
        })
        .catch((err) => {
            console.error('❌ [Costco Auth] Error:', err);
            process.exit(1);
        });
}
