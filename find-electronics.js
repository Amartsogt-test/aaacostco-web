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

const snapshot = await db.collection('products').limit(300).get();
snapshot.forEach(doc => {
    const data = doc.data();
    const name = (data.name || '').toLowerCase();
    if (name.includes('samsung') || name.includes('삼성') || name.includes('watch') || name.includes('apple')) {
        console.log(`${doc.id} | ${data.name} | ${data.name_mn}`);
    }
});
process.exit(0);
