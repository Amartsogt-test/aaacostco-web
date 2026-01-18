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

const key = 'AIzaSyBtJ68dcLuFTvo9C_1NWQ-vMlat_K-8_jM';
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
