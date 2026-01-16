
const { execSync } = require('child_process');

console.log("🌙 Starting Nightly Maintenance...");

try {
    console.log("\n1️⃣ Running Sync & Cleanup...");
    execSync('node scripts/core/sync.js', { stdio: 'inherit' });

    console.log("\n2️⃣ Running Weight Fix...");
    execSync('node scripts/core/fix-weights.js', { stdio: 'inherit' });

    console.log("\n3️⃣ Running Translations...");
    execSync('node scripts/core/translate.js', { stdio: 'inherit' });

    console.log("\n4️⃣ Generating Report...");
    execSync('node scripts/core/report-count.js', { stdio: 'inherit' });

    console.log("\n✅ Nightly Maintenance Complete!");
} catch (error) {
    console.error("\n❌ Error during nightly run:", error.message);
}
