/**
 * 🔐 Secure admin provisioning (run locally, never deployed to the client).
 *
 * Replaces the old unauthenticated SMS "00880088" backdoor. This grants admin
 * rights the right way: it sets a STRONG password on the admin auth account and
 * the `isAdmin` custom claim that the Firestore/Storage rules check. No SMS needed.
 *
 * Requirements: functions/service-account.json must exist (it is gitignored).
 *
 * Usage (from the project root):
 *   node scripts/grant-admin.cjs <email> <newStrongPassword> [phone]
 *
 * Example:
 *   node scripts/grant-admin.cjs 00880088@sms.costco.mn 'S0me-Long-Rand0m-Passphrase!' 00880088
 *
 * After running, log in on the site by typing the admin phone (default 00880088)
 * and entering the password you set here. You are admin via the custom claim.
 */
const path = require('path');
const fs = require('fs');

// Resolve firebase-admin from the functions install so this script needs no
// separate npm install at the repo root.
const adminPath = path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin');
const admin = require(adminPath);

const saPath = path.join(__dirname, '..', 'functions', 'service-account.json');
if (!fs.existsSync(saPath)) {
    console.error('❌ functions/service-account.json not found. Place your Firebase service account key there.');
    process.exit(1);
}

const [, , email, password, phone] = process.argv;
if (!email || !password) {
    console.error('Usage: node scripts/grant-admin.cjs <email> <strongPassword> [phone]');
    process.exit(1);
}
if (password.length < 5) {
    console.error('❌ Choose a password of at least 5 characters.');
    process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(saPath)) });

(async () => {
    try {
        let user;
        try {
            user = await admin.auth().getUserByEmail(email);
            // Existing account → reset to the new strong password.
            await admin.auth().updateUser(user.uid, { password });
            console.log(`ℹ️  Updated password for existing user ${email}`);
        } catch (e) {
            if (e.code === 'auth/user-not-found') {
                user = await admin.auth().createUser({
                    email,
                    password,
                    displayName: phone ? `+976${phone}` : 'Admin'
                });
                console.log(`✅ Created admin auth user ${email}`);
            } else {
                throw e;
            }
        }

        // 1) Custom claim — what the security rules check (request.auth.token.isAdmin).
        await admin.auth().setCustomUserClaims(user.uid, { isAdmin: true });

        // 2) Firestore user doc fallback + profile.
        await admin.firestore().collection('users').doc(user.uid).set({
            uid: user.uid,
            email,
            phone: phone ? `+976${phone}` : null,
            name: 'Admin',
            isAdmin: true,
            loginProvider: 'password',
            updatedAt: new Date().toISOString()
        }, { merge: true });

        console.log(`✅ Admin granted to ${email} (uid: ${user.uid}).`);
        console.log('   Sign out and back in (or refresh the ID token) for the claim to take effect.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Failed:', err.message);
        process.exit(1);
    }
})();
