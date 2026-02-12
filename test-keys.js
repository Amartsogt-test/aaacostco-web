import { GoogleGenerativeAI } from '@google/generative-ai';

async function test(key, modelName) {
    try {
        console.log(`Testing model [${modelName}]...`);
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent('Hi');
        console.log(`✅ SUCCESS: ${result.response.text().substring(0, 50)}`);
        return true;
    } catch (e) {
        console.log(`❌ FAIL: ${e.message}`);
        return false;
    }
}

const key = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
if (!key) {
    console.error("❌ GEMINI_API_KEY not found in environment");
    process.exit(1);
}
const models = [
    'gemini-1.5-flash',
    'gemini-1.5-flash-latest',
    'gemini-1.5-pro',
    'gemini-pro',
    'gemini-2.0-flash-exp'
];

for (const m of models) {
    if (await test(key, m)) break;
}
process.exit(0);
