const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, 'functions/service-account.json');
const serviceAccount = require(SERVICE_ACCOUNT_PATH);

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

async function diagnose() {
    console.log('--- Auditing settings/currency ---');
    const currencyDoc = await db.collection('settings').doc('currency').get();
    if (currencyDoc.exists) {
        const data = currencyDoc.data();
        console.log('Data:', JSON.stringify(data, null, 2));

        // Check for non-primitive types in fields used for calculations
        ['wonRate', 'golomtRates', 'tdbRates', 'khanRates'].forEach(key => {
            const val = data[key];
            console.log(`${key} type:`, typeof val);
            if (val && typeof val === 'object') {
                if (key === 'wonRate') {
                    console.error(`❌ wonRate is an object, should be a number!`);
                } else {
                    console.log(`${key} detail:`, JSON.stringify(val));
                    // Check subfields
                    Object.entries(val).forEach(([subKey, subVal]) => {
                        console.log(`  ${subKey} type:`, typeof subVal);
                    });
                }
            }
        });
    } else {
        console.log('settings/currency does not exist');
    }

    console.log('\n--- Auditing settings/general ---');
    const generalDoc = await db.collection('settings').doc('general').get();
    if (generalDoc.exists) {
        const data = generalDoc.data();
        Object.entries(data).forEach(([key, val]) => {
            console.log(`${key} type:`, typeof val);
        });
    }

    console.log('\n--- Auditing users (limited) ---');
    const usersSnapshot = await db.collection('users').limit(10).get();
    usersSnapshot.forEach(doc => {
        const data = doc.data();
        console.log(`User ${doc.id}: isAdmin type: ${typeof data.isAdmin}, val: ${JSON.stringify(data.isAdmin)}`);
    });
}

diagnose().then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
});
