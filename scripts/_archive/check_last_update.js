import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const serviceAccountPath = path.join(__dirname, '../functions/service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function checkLastUpdate() {
    try {
        console.log("Checking the most recently updated products...");
        const snapshot = await db.collection('products')
            .orderBy('updatedAt', 'desc')
            .limit(5)
            .get();

        if (snapshot.empty) {
            console.log("No products found.");
            process.exit(0);
        }

        snapshot.forEach(doc => {
            const data = doc.data();
            let dateStr = "Unknown";
            if (data.updatedAt) {
                if (data.updatedAt.toDate) {
                    dateStr = data.updatedAt.toDate().toLocaleString();
                } else if (data.updatedAt._seconds) {
                    dateStr = new Date(data.updatedAt._seconds * 1000).toLocaleString();
                } else {
                    dateStr = data.updatedAt;
                }
            }
            console.log(`- [${doc.id}] ${data.name || data.title} | Last Updated: ${dateStr}`);
        });
        process.exit(0);
    } catch (error) {
        console.error("Error fetching products:", error);
        process.exit(1);
    }
}

checkLastUpdate();
