
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

// 1. Config
const API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
const SERVICE_ACCOUNT_PATH = path.join(__dirname, '../functions/service-account.json');
const COLLECTION_NAME = 'products';
const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// Rate Limiting (Daily is smaller volume, but safety first)
const DELAY_MS = 8000; // 8 seconds between products

// Regex
const KOREAN_REGEX = /[\u3131-\uD79D]/ugi;
const WON_REGEX = /₩/g;

// 2. Initialize
if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error(`Error: Service account not found at ${SERVICE_ACCOUNT_PATH}`);
    process.exit(1);
}
const serviceAccount = require(SERVICE_ACCOUNT_PATH);
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();
// Drop undefined fields on writes instead of throwing. E.g. a sale item missing
// both originalPrice and price would make oldPrice undefined and crash the daily
// report write; with this, the bad field is simply omitted.
db.settings({ ignoreUndefinedProperties: true });
const genAI = new GoogleGenerativeAI(API_KEY);

// 3. Helpers
const hasKorean = (text) => {
    if (!text) return false;
    const str = typeof text === 'string' ? text : JSON.stringify(text);
    return KOREAN_REGEX.test(str) || WON_REGEX.test(str);
};

async function callAI(prompt) {
    const m = genAI.getGenerativeModel({ model: MODEL_NAME });
    let attempts = 0;
    while (attempts < 3) {
        try {
            const result = await m.generateContent(prompt);
            return result.response.text();
        } catch (error) {
            if (error.message.includes('429')) {
                console.log(`      ⏳ Quota hit (429). Waiting 30s...`);
                await new Promise(r => setTimeout(r, 30000));
                attempts++;
            } else {
                throw error;
            }
        }
    }
    throw new Error('Max retries reached');
}

// ------------------------------------------------------------------
// PIPELINE FUNCTIONS
// ------------------------------------------------------------------

async function fixWeight(p) {
    // Only fix if 0 or suspicious
    if (p.weight > 0.5 && !hasKorean(p.name)) return null; // Assume OK if weight exists and > 0.5kg (simple heuristic)
    if (p.weight > 0 && p.aiWeight) return null; // Already fixed

    const context = `Name: ${p.name_mn || p.name}, Specs: ${JSON.stringify(p.specifications_mn || p.specifications || [])}`;
    const prompt = `Calculate TOTAL shipping weight (kg) for: ${context}. Return JSON {"weightKg": number, "reason": "string"}`;

    try {
        const res = await callAI(prompt);
        const json = JSON.parse(res.replace(/```json|```/g, '').trim());
        if (json.weightKg > 0) return { weight: json.weightKg, aiWeight: json.weightKg, aiWeightReason: json.reason };
    } catch (e) {
        console.warn(`      ⚠️ Weight fix failed: ${e.message}`);
    }
    return null;
}

async function fixTranslation(p) {
    const updates = {};
    let changed = false;

    try {
        if (hasKorean(p.name_mn)) {
            const res = await callAI(`Translate name to Mongolian (Cyrillic) ONLY:\n${p.name_mn || p.name}`);
            updates.name_mn = res.trim();
            changed = true;
        }
        if (hasKorean(p.description_mn)) {
            const res = await callAI(`Translate HTML description to Mongolian. Keep HTML:\n${(p.description_mn || p.description).substring(0, 2000)}`);
            updates.description_mn = res.replace(/```html|```/g, '').trim();
            changed = true;
        }
        if (hasKorean(p.specifications_mn)) {
            const res = await callAI(`Translate JSON specs to Mongolian. Return JSON:\n${JSON.stringify(p.specifications || p.specifications_mn)}`);
            updates.specifications_mn = JSON.parse(res.replace(/```json|```/g, '').trim());
            changed = true;
        }
    } catch (e) {
        console.warn(`      ⚠️ Transl fix failed: ${e.message}`);
    }

    return changed ? updates : null;
}

async function generateDesc(p) {
    if (p.shortDescription && p.shortDescription.length > 10) return null;

    try {
        const prompt = `Write a 1-sentence Mongolian summary for: ${p.name_mn || p.name}. Friendly tone. Plain text only.`;
        const res = await callAI(prompt);
        return { shortDescription: res.trim(), shortDescriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp() };
    } catch (e) {
        console.warn(`      ⚠️ Desc gen failed: ${e.message}`);
    }
    return null;
}

async function notifyAdmin(stats, reportId) {
    const BOT_ID = 'system-products-bot';
    const BOT_NAME = 'Бараа Шинэчлэл';

    try {
        // 1. Check/Create Conversation
        const chatsRef = db.collection('chats');
        const q = chatsRef.where('userId', '==', BOT_ID).limit(1);
        const snapshot = await q.get();

        let convRef;
        if (snapshot.empty) {
            const newConv = await chatsRef.add({
                userId: BOT_ID,
                userName: BOT_NAME,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                lastMessage: 'Систем эхэллээ',
                lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
                unreadByAdmin: 1,
                unreadByUser: 0,
                needsAdmin: true
            });
            convRef = newConv;
        } else {
            convRef = snapshot.docs[0].ref;
        }

        // 2. Prepare Message
        let messageText = `📊 **ӨДРИЙН ТАЙЛАН** (${reportId})\n\n`;
        messageText += `🕒 ${new Date().toLocaleString('mn-MN', { timeZone: 'Asia/Ulaanbaatar' })}\n\n`;
        messageText += `🆕 **Шинэ Бараа:** ${stats.newProductsCount}\n`;
        messageText += `🏷️ **Идэвхтэй Хямдрал:** ${stats.activeSalesCount}\n`;
        messageText += `✏️ **AI Засвар:** ${stats.updated}\n`;

        if (stats.updated > 0) {
            messageText += `   ├ ⚖️ Жин: ${stats.weights}\n`;
            messageText += `   ├ 🗣️ Орчуулга: ${stats.translations}\n`;
            messageText += `   └ 📝 Тайлбар: ${stats.descriptions}\n`;
        }

        messageText += `\n🔗 Дэлгэрэнгүйг Admin Portal > Daily Reports цэснээс харна уу.`;

        // 3. Send Message
        await convRef.collection('messages').add({
            text: messageText,
            isFromAdmin: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            read: false,
            pinned: false,
            liked: false
        });

        // 4. Update Meta
        await convRef.update({
            lastMessage: messageText.substring(0, 50) + '...',
            lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
            unreadByAdmin: admin.firestore.FieldValue.increment(1),
            needsAdmin: true
        });

        console.log('🔔 Admin notification sent successfully.');

    } catch (error) {
        console.error('❌ Failed to send notification:', error);
    }
}

// ------------------------------------------------------------------
// MAIN
// ------------------------------------------------------------------

async function run() {
    console.log('🚀 Starting DAILY Product Pipeline...');

    // 1. Get products created/updated in last 24h
    // Focusing on 'active' for processing
    const snapshot = await db.collection(COLLECTION_NAME)
        .where('status', '==', 'active')
        .limit(100) // Daily limit
        .get();

    console.log(`Scanning ${snapshot.size} recent active products for issues...`);

    let processed = 0;
    let updated = 0;
    let updatedCounts = { weights: 0, translations: 0, descriptions: 0 };
    let detailedLogs = { weights: [], translations: [], descriptions: [] };

    for (const doc of snapshot.docs) {
        const p = { id: doc.id, ...doc.data() };
        let docUpdates = {};

        console.log(`\n[${processed + 1}] Checking ${p.name_mn || p.name}...`);

        // A. Weight Check
        const weightUpdates = await fixWeight(p);
        if (weightUpdates) {
            console.log(`      ⚖️ Weight Fixed: ${weightUpdates.weight}kg`);
            docUpdates = { ...docUpdates, ...weightUpdates };
            p.weight = weightUpdates.weight;
            updatedCounts.weights++;
            detailedLogs.weights.push({ id: p.id, name: p.name_mn || p.name, result: weightUpdates.weight });
        }

        // B. Translation Check
        const transUpdates = await fixTranslation(p);
        if (transUpdates) {
            console.log(`      🗣️ Translation Fixed`);
            docUpdates = { ...docUpdates, ...transUpdates };
            if (transUpdates.name_mn) p.name_mn = transUpdates.name_mn;
            updatedCounts.translations++;
            detailedLogs.translations.push({ id: p.id, name: p.name_mn || p.name });
        }

        // C. Description Check
        const descUpdates = await generateDesc(p);
        if (descUpdates) {
            console.log(`      📝 Description Generated`);
            docUpdates = { ...docUpdates, ...descUpdates };
            updatedCounts.descriptions++;
            detailedLogs.descriptions.push({ id: p.id, name: p.name_mn || p.name });
        }

        // SAVE
        if (Object.keys(docUpdates).length > 0) {
            docUpdates.lastDailyProcessedAt = admin.firestore.FieldValue.serverTimestamp();
            await db.collection(COLLECTION_NAME).doc(p.id).update(docUpdates);
            updated++;
            console.log(`      ✅ SAVED all changes.`);
            await new Promise(r => setTimeout(r, DELAY_MS));
        } else {
            console.log(`      ✨ Perfect (No changes needed)`);
        }

        processed++;
    }

    // ------------------------------------------------------------------
    // REPORT GENERATION
    // ------------------------------------------------------------------
    const todayStr = new Date().toISOString().split('T')[0];
    const reportRef = db.collection('daily_reports').doc(todayStr);

    const yesterday = new Date();
    yesterday.setHours(yesterday.getHours() - 24);

    // 1. Get New Products
    const newProductsSnap = await db.collection(COLLECTION_NAME)
        .where('createdAt', '>=', yesterday.toISOString())
        .get();

    const newProducts = newProductsSnap.docs.map(d => ({
        id: d.id,
        name: d.data().name_mn || d.data().name,
        price: d.data().price || 0
    }));

    // 2. Get Sales
    const salesSnap = await db.collection(COLLECTION_NAME)
        .where('updatedAt', '>=', yesterday.toISOString())
        .where('hasDiscount', '==', true)
        .get();

    const activeSales = salesSnap.docs.map(d => ({
        id: d.id,
        name: d.data().name_mn || d.data().name,
        price: d.data().price || 0,
        oldPrice: d.data().originalPrice || d.data().price
    }));

    // 3. Compile Report
    const reportData = {
        date: admin.firestore.FieldValue.serverTimestamp(),
        dateStr: todayStr,
        stats: {
            processed: processed,
            updated: updated,
            newProductsCount: newProducts.length,
            activeSalesCount: activeSales.length,
            ...updatedCounts
        },
        lists: {
            newProducts: newProducts.slice(0, 50),
            activeSales: activeSales.slice(0, 50),
            fixedWeights: detailedLogs.weights,
            fixedTranslations: detailedLogs.translations,
            fixedDescriptions: detailedLogs.descriptions
        }
    };

    await reportRef.set(reportData);
    console.log(`📝 Daily Report saved to daily_reports/${todayStr}`);

    await notifyAdmin(reportData.stats, todayStr);

    console.log(`\n🎉 Daily Pipeline Done! Updated ${updated} products.`);
    process.exit(0);
}

run().catch(console.error);
