
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env.local') });

const SERVICE_ACCOUNT_PATH = path.join(__dirname, 'functions/service-account.json');

if (!admin.apps.length) {
    const serviceAccount = require(SERVICE_ACCOUNT_PATH);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

async function checkLastRun() {
    try {
        const docRef = db.doc('settings/currency');
        const docSnap = await docRef.get();

        if (docSnap.exists) {
            const data = docSnap.data();
            console.log('Currency Settings Last Updated:');

            if (data.lastUpdated) {
                const date = data.lastUpdated.toDate ? data.lastUpdated.toDate() : new Date(data.lastUpdated);
                console.log(`Updated By: ${data.updatedBy || 'Unknown'}`);

                if (data.khanRates) console.log(`Khan Last: ${data.khanRates.lastUpdated}`);
                if (data.golomtRates) console.log(`Golomt Last: ${data.golomtRates.lastUpdated}`);
                if (data.tdbRates) console.log(`TDB Last: ${data.tdbRates.lastUpdated}`);

            } else {
                console.log('No lastUpdated field found.');
            }

            console.log('\nChecking History (last 5):');
            const historySnap = await db.collection('settings/currency/history')
                .orderBy('date', 'desc')
                .limit(5)
                .get();

            historySnap.forEach(doc => {
                const h = doc.data();
                const d = h.date ? (h.date.toDate ? h.date.toDate() : new Date(h.date)) : 'N/A';
                console.log(`- ${d.toLocaleString()}: Rate=${h.rate || 'N/A'}, User=${h.user || 'Unknown'}`);
            });

            console.log('\nChecking for Automation Activity around 9:00 AM (01:00 UTC)...');
            const start = new Date('2026-01-19T01:00:00Z');
            const end = new Date('2026-01-19T01:30:00Z'); // 30 min window

            const productSnap = await db.collection('products')
                .where('updatedAt', '>=', start.toISOString())
                .where('updatedAt', '<=', end.toISOString())
                .limit(5)
                .get();

            if (productSnap.empty) {
                console.log('❌ No products updated between 9:00 AM - 9:30 AM.');
            } else {
                console.log(`✅ Found ${productSnap.size} products updated in window:`);
                productSnap.forEach(d => console.log(`- ${d.id}: ${d.data().updatedAt}`));
            }

        } else {
            console.log('Currency settings document does not exist.');
        }
    } catch (error) {
        console.error('Error checking timestamp:', error);
    }
    process.exit(0);
}

checkLastRun();
