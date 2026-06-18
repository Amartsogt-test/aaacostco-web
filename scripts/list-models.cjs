/**
 * List the Gemini models your GEMINI_API_KEY can use (for generateContent).
 * Reads the key from .env.local — your key is never printed.
 *
 * Usage:  node scripts/list-models.cjs
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const key = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
if (!key) {
    console.error('❌ GEMINI_API_KEY not found in .env.local');
    process.exit(1);
}

(async () => {
    try {
        const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + key).then((x) => x.json());
        if (r.error) { console.error('❌ API error:', r.error.message); process.exit(1); }
        const models = (r.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'));
        console.log(`\nҮүсгэх (generateContent) загварууд — ${models.length}:\n`);
        for (const m of models) console.log('   ' + m.name.replace('models/', ''));
        console.log('\nЭдгээрээс нэгийг сонгоод .env.local-д нэм:  GEMINI_MODEL=<нэр>');
        process.exit(0);
    } catch (e) {
        console.error('❌ Failed:', e.message);
        process.exit(1);
    }
})();
