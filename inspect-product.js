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

const productId = process.argv[2] || '1310002';

const doc = await db.collection('products').doc(productId).get();
if (doc.exists) {
    console.log(JSON.stringify(doc.data(), null, 2));
} else {
    console.log('Product not found');
}
process.exit(0);
