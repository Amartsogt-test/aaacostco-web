
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serviceAccountPath = path.join(__dirname, '../functions/service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function run() {
    const id = '1872099';
    console.log(`Force resetting weight for ${id}...`);
    await db.collection('products').doc(id).update({
        weight: 0,
        aiWeight: 0,
        aiWeightReason: "Manual Force Reset for Testing",
        updatedAt: new Date().toISOString()
    });
    console.log("Done.");
}

run();
