
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env.local') });

async function testKey() {
    const key = process.env.VITE_GEMINI_API_KEY;
    console.log(`🔑 Testing Key: ${key ? key.substring(0, 5) + '...' : 'MISSING'}`);

    if (!key) throw new Error("Key not found in env");

    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    try {
        const result = await model.generateContent("Hello, are you working?");
        console.log(`✅ Success! Response: ${result.response.text()}`);
    } catch (e) {
        console.error(`❌ API Error: ${e.message}`);
        process.exit(1);
    }
}

testKey();
