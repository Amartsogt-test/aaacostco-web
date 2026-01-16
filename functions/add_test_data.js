const admin = require("firebase-admin");
const serviceAccount = require("./service-account.json");

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}

const db = admin.firestore();

async function createTestData() {
    try {
        const productRef = db.collection("products").doc("prod_001");
        await productRef.set({
            name: "Улаан Пүүз",
            price: "150,000",
            image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8cmVkJTIwc2hvZXN8ZW58MHx8MHx8fDA%3D&w=1000&q=80", // Real image URL
            description: "Test product added via script"
        });
        console.log("Successfully created document 'prod_001' in 'products' collection.");
    } catch (error) {
        console.error("Error creating test data:", error);
    }
}

createTestData();
