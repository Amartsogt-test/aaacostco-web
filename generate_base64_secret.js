const fs = require('fs');
const path = require('path');

const filePath = path.join('functions', 'service-account.json');

try {
    if (!fs.existsSync(filePath)) {
        console.error('❌ File not found:', filePath);
        process.exit(1);
    }

    const content = fs.readFileSync(filePath);
    const base64 = content.toString('base64');

    console.log('\n✅ YOUR BASE64 SECRET CODE:\n');
    console.log(base64);
    console.log('\n📋 Copy the above code widely (Ctrl+A, Ctrl+C) and update FIREBASE_SERVICE_ACCOUNT with this.\n');
} catch (error) {
    console.error('Error:', error.message);
}
