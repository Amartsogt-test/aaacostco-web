const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, '../functions/service-account.json');

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error(`Error: Service account not found at ${SERVICE_ACCOUNT_PATH}`);
    process.exit(1);
}

const serviceAccount = require(SERVICE_ACCOUNT_PATH);

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function run() {
    const doc = await db.collection('system').doc('syncStatus').get();
    if (!doc.exists) {
        console.log('No active sync status found.');
        process.exit(0);
    }

    const data = doc.data();
    console.log(`\n🔄 Sync Status: ${data.state.toUpperCase()}`);
    console.log(`Last Updated: ${data.lastUpdated ? data.lastUpdated.toDate().toLocaleString() : 'N/A'}`);

    if (data.steps && Array.isArray(data.steps)) {
        console.log('\n--- Progress by Category ---');
        let total = 0;
        let processed = 0;

        data.steps.forEach(step => {
            const bar = '█'.repeat(Math.round(step.percentage / 5)) + '░'.repeat(20 - Math.round(step.percentage / 5));
            console.log(`${step.label}: [${bar}] ${step.percentage}% (${step.processed}/${step.total})`);
            total += (step.total || 0);
            processed += (step.processed || 0);
        });

        const overallPercent = total > 0 ? Math.round((processed / total) * 100) : 0;
        console.log(`\n🌍 Overall Progress: ${overallPercent}% (${processed}/${total} items processed)`);
    }

    process.exit(0);
}

run().catch(console.error);
