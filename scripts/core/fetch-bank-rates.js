/**
 * Bank Rates Fetcher for GitHub Actions
 * Fetches KRW exchange rates from Khan Bank API and updates Firestore
 */

import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';

// Initialize Firebase
let db;
if (existsSync('./firebase-service-account.json')) {
    const serviceAccount = JSON.parse(readFileSync('./firebase-service-account.json', 'utf8'));
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    db = admin.firestore();
} else {
    console.error('❌ firebase-service-account.json not found');
    process.exit(1);
}

async function fetchKhanBankRates() {
    const today = new Date().toISOString().split('T')[0];
    const url = `https://www.khanbank.com/api/back/rates?date=${today}`;

    console.log(`📊 Fetching Khan Bank rates: ${url}`);

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (!data || !Array.isArray(data)) {
            console.error('❌ Invalid response from Khan Bank API');
            return null;
        }

        const krwRow = data.find(r => r.code === 'KRW');

        if (!krwRow) {
            console.error('❌ KRW not found in Khan Bank response');
            return null;
        }

        console.log(`✅ Khan Bank KRW: Buy=${krwRow.cashBuyRate}, Sell=${krwRow.cashSellRate}`);

        return {
            cashBuy: parseFloat(krwRow.cashBuyRate) || 0,
            cashSell: parseFloat(krwRow.cashSellRate) || 0,
            nonCashBuy: parseFloat(krwRow.buyRate) || 0,
            nonCashSell: parseFloat(krwRow.sellRate) || 0,
            lastUpdated: new Date().toISOString()
        };
    } catch (error) {
        console.error('❌ Error fetching Khan Bank rates:', error.message);
        return null;
    }
}

async function updateFirestore(rates) {
    if (!rates) {
        console.log('⚠️ No rates to update');
        return;
    }

    try {
        // Get existing data to preserve previous rates
        const docRef = db.collection('settings').doc('exchangeRates');
        const doc = await docRef.get();
        const existingData = doc.exists ? doc.data() : {};

        // Update with new Khan Bank rates
        const updateData = {
            khanRates: rates,
            previousKhanRates: existingData.khanRates || null,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: 'GitHubActions'
        };

        await docRef.set(updateData, { merge: true });

        console.log('✅ Firestore updated with Khan Bank rates');
    } catch (error) {
        console.error('❌ Error updating Firestore:', error.message);
    }
}

async function main() {
    console.log('='.repeat(50));
    console.log('   BANK RATES UPDATER');
    console.log('   ' + new Date().toISOString());
    console.log('='.repeat(50));

    const khanRates = await fetchKhanBankRates();
    await updateFirestore(khanRates);

    console.log('='.repeat(50));
    console.log('   DONE');
    console.log('='.repeat(50));

    process.exit(0);
}

main();
