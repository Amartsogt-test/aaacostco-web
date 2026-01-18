import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serviceAccountPath = path.join(__dirname, 'functions/service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function checkCoverage() {
    let total = 0;
    let withPrice = 0;

    const snapshot = await db.collection('products').select('estimatedWarehousePrice').get();
    total = snapshot.size;

    snapshot.forEach(doc => {
        if (doc.data().estimatedWarehousePrice !== undefined) {
            withPrice++;
        }
    });

    console.log(`TOTAL PRODUCTS: ${total}`);
    console.log(`PRODUCTS WITH STORE PRICE FIELD: ${withPrice}`);
    console.log(`COVERAGE: ${((withPrice / total) * 100).toFixed(2)}%`);
}

checkCoverage().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
