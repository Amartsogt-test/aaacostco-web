import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

// Load service account (adjust path if needed)
const serviceAccountPath = './functions/service-account.json';

try {
    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

    initializeApp({
        credential: cert(serviceAccount)
    });

    const db = getFirestore();

    async function fixUrls() {
        console.log('Starting URL fix...');
        const productsRef = db.collection('products');
        const snapshot = await productsRef.get();

        if (snapshot.empty) {
            console.log('No products found.');
            return;
        }

        const batch = db.batch();
        let count = 0;

        snapshot.forEach(doc => {

            const pid = doc.id;

            // Construct URL based on ID (Costco code)
            // Only update if URL is missing or we want to force it
            const url = `https://www.costco.co.kr/p/${pid}`;

            batch.update(doc.ref, { url: url });
            count++;
        });

        await batch.commit();
        console.log(`Successfully updated ${count} products with URLs.`);
    }

    fixUrls().catch(console.error);

} catch (error) {
    console.error("Error initializing or running script:", error);
}
