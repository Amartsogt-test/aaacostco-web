
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

// Korean Regex
const KOREAN_REGEX = /[\u3131-\uD79D]/ugi;
const WON_REGEX = /₩/g;

const hasKorean = (text) => {
    if (!text) return false;
    const str = typeof text === 'string' ? text : JSON.stringify(text);
    return KOREAN_REGEX.test(str) || WON_REGEX.test(str);
};

async function run() {
    console.log('📊 Checking Progress (Fast)...');

    const snapshot = await db.collection('products')
        .select('name_mn', 'description_mn', 'specifications_mn', 'shortDescription', 'translationStatus', 'aiDescriptionStatus')
        .get();

    const total = snapshot.size;

    let pendingTranslation = 0;
    let pendingDescription = 0;

    snapshot.forEach(doc => {
        const d = doc.data();

        // 1. Translation Check
        if (d.translationStatus !== 'manual_required') {
            if (hasKorean(d.name_mn) || hasKorean(d.description_mn) || hasKorean(d.specifications_mn)) {
                pendingTranslation++;
            }
        }

        // 2. Brief Explanation (Short Description) Check
        if (d.aiDescriptionStatus !== 'failed') {
            if (!d.shortDescription || d.shortDescription.length < 10) {
                pendingDescription++;
            }
        }
    });

    console.log(`\nResults:`);
    console.log(`Total Products: ${total}`);
    console.log(`Pending Translation: ${pendingTranslation}`);
    console.log(`Pending Brief Explanation (Tovch Tailbar): ${pendingDescription}`);
    process.exit(0);
}

run().catch(console.error);
