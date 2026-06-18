const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const serviceAccountPath = path.join(__dirname, 'functions/service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();
db.collection('products').doc('519365').get().then(doc => {
    if (doc.exists) console.log(JSON.stringify(doc.data(), null, 2));
    else console.log("Not found");
    process.exit(0);
});
