
const { execSync } = require('child_process');
const path = require('path');

console.log("🌙 Starting Nightly Maintenance...");
console.log(`⏰ ${new Date().toLocaleString()}\n`);

const steps = [
    {
        name: "1️⃣  Full Product Sync (Python → Costco API → Firebase)",
        cmd: `node -e "
            const { execSync } = require('child_process');
            try {
                // Try to find Python
                const pythonPaths = ['python', 'py -3', 'python3'];
                let pythonCmd = null;
                for (const p of pythonPaths) {
                    try { execSync(p + ' --version', {stdio:'pipe'}); pythonCmd = p; break; } catch {}
                }
                if (pythonCmd) {
                    execSync(pythonCmd + ' scraper/full_sync.py --skip-translate', {stdio:'inherit', cwd:'${path.resolve(__dirname, '../..').replace(/\\/g, '/')}'});
                } else {
                    console.log('⚠️  Python not found, skipping full_sync.py');
                }
            } catch(e) { console.error('Full sync error:', e.message); }
        "`,
        optional: true,
    },
    {
        name: "2️⃣  Special Categories Sync (Sale, New, Kirkland)",
        cmd: 'node scripts/core/sync.js',
    },
    {
        name: "3️⃣  AI Weight Calculation (Gemini)",
        cmd: 'node scripts/core/fix-weights-ai.js',
    },
    {
        name: "4️⃣  Translation (Gemini → Mongolian)",
        cmd: 'node scripts/core/translate.js',
    },
    {
        name: "5️⃣  Report",
        cmd: 'node scripts/core/report-count.js',
    },
];

let passed = 0;
let failed = 0;

for (const step of steps) {
    try {
        console.log(`\n${step.name}`);
        console.log("-".repeat(50));
        execSync(step.cmd, { stdio: 'inherit', cwd: path.resolve(__dirname, '../..') });
        passed++;
    } catch (error) {
        if (step.optional) {
            console.log(`⚠️  Skipped (optional): ${error.message}`);
        } else {
            console.error(`❌ Failed: ${error.message}`);
            failed++;
        }
    }
}

console.log(`\n${"=".repeat(50)}`);
console.log(`✅ Nightly Maintenance Complete! (${passed} passed, ${failed} failed)`);
console.log(`⏰ ${new Date().toLocaleString()}`);
