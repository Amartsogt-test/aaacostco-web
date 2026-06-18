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

async function checkZeroPrice() {
    try {
        console.log("Checking for products with price = 0...");
        const snapshot = await db.collection('products')
            .where('price', '==', 0)
            .get();

        if (snapshot.empty) {
            console.log("No products with 0 price found.");
            process.exit(0);
        }

        console.log(`Found ${snapshot.size} products with 0 price:`);
        let count = 0;
        snapshot.forEach(doc => {
            const data = doc.data();
            if (count < 20) {
                 console.log(`- [${doc.id}] ${data.name || data.title} (Price: ${data.price})`);
            }
            count++;
        });
        if (count > 20) {
            console.log(`...and ${count - 20} more.`);
        }
        process.exit(0);
    } catch (error) {
        console.error("Error fetching products:", error);
        process.exit(1);
    }
}

checkZeroPrice();
