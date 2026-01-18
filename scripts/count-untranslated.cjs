
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
    console.log('📊 Counting untranslated products...');

    const snapshot = await db.collection('products').get();
    const total = snapshot.size;

    let missingName = 0;
    let missingDesc = 0;
    let sameName = 0; // potentially untranslated if name_mn == name

    snapshot.forEach(doc => {
        const data = doc.data();

        // Check Name
        if (!data.name_mn) {
            missingName++;
        } else if (data.name_mn === data.name) {
            sameName++;
        }

        // Check Description
        if (!data.description_mn) {
            missingDesc++;
        }
    });

    console.log(`\n📋 Statistics:`);
    console.log(`   - Total Products: ${total}`);
    console.log(`   - Missing Mongolian Name: ${missingName}`);
    console.log(`   - Missing Mongolian Description: ${missingDesc}`);
    console.log(`   - Name_MN is same as Original Name (Likely Untranslated): ${sameName}`);

    console.log(`\nEstimated Total Untranslated (Name): ${missingName + sameName}`);

    process.exit(0);
}

run().catch(console.error);
