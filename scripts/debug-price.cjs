const admin = require("firebase-admin");
const path = require('path');
const fs = require('fs');

// 0. Ensure we use the SAME firebase-admin instance as the functions
const firebaseAdminPath = path.resolve(__dirname, '../functions/node_modules/firebase-admin');
const adminLib = require(firebaseAdminPath);

// 1. Resolve service account
const serviceAccountPath = path.resolve(__dirname, '../functions/service-account.json');
let serviceAccount;

if (fs.existsSync(serviceAccountPath)) {
    serviceAccount = require(serviceAccountPath);
} else {
    // Fallback
    const fallback = 'e:\\Google Drive\\aaacostco\\functions\\service-account.json';
    if (fs.existsSync(fallback)) {
        serviceAccount = require(fallback);
    } else {
        console.error("❌ Service account not found.");
        process.exit(1);
    }
}

// 2. Initialize Firebase Admin
if (!adminLib.apps.length) {
    adminLib.initializeApp({
        credential: adminLib.credential.cert(serviceAccount),
    });
}
const db = adminLib.firestore();

// 3. Helper to fetch
const fetch = require('node-fetch'); // Ensure node-fetch is available or use built-in if node 18+

async function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function fetchJson(url, cookie = '', userAgent = '') {
    const headers = {
        'User-Agent': userAgent || 'Mozilla/5.0'
    };
    if (cookie) headers['Cookie'] = cookie;

    console.log(`Fetching ${url}...`);
    // console.log(`Cookie: ${cookie.substring(0, 50)}...`);

    const response = await fetch(url, { headers });
    console.log(`Status: ${response.status}`);
    if (!response.ok) return null;
    return await response.json();
}

async function debugProduct(productId) {
    // Get credentials from Firestore
    const settingsSnap = await db.collection('settings').doc('scraper').get();
    const settings = settingsSnap.data();
    const cookie = settings.cookie || '';
    const userAgent = settings.userAgent || '';

    const url = `https://www.costco.co.kr/rest/v2/korea/products/${productId}?fields=FULL`;

    try {
        const data = await fetchJson(url, cookie, userAgent);
        console.log("---------------- DATA ----------------");
        if (data) {
            console.log(`Code: ${data.code}`);
            console.log(`Name: ${data.name}`);
            console.log(`Price:`, data.price);
            console.log(`BasePrice:`, data.basePrice);
            console.log(`Stock:`, data.stock);
            if (data.price && data.price.value === 0) {
                console.log("⚠️ PRICE IS 0 in response.");
            }
        } else {
            console.log("No data returned or error.");
        }
        console.log("--------------------------------------");
    } catch (e) {
        console.error("Fetch failed:", e);
    }
}

// Test with Samsung Washer ID from previous list
debugProduct('635295');
