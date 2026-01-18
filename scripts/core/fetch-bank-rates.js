
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import axios from 'axios';
import https from 'https';
import fs from 'fs';
import path from 'path';

// --- Configuration ---
const serviceAccountPath = path.resolve(process.cwd(), 'functions/service-account.json');

if (!fs.existsSync(serviceAccountPath)) {
    console.error('❌ Service account file not found:', serviceAccountPath);
    process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

initializeApp({
    credential: cert(serviceAccount)
});

const db = getFirestore();
const agent = new https.Agent({ rejectUnauthorized: false });

// --- Helper: Get Date Strings ---
function getDates() {
    const today = new Date();
    const khanDate = today.toISOString().split('T')[0]; // YYYY-MM-DD
    const golomtDate = khanDate.replace(/-/g, '');      // YYYYMMDD
    return { khanDate, golomtDate };
}

// --- 1. Fetch Khan Bank ---
async function fetchKhanRates(dateStr) {
    const url = `https://www.khanbank.com/api/back/rates?date=${dateStr}`;
    console.log(`📊 Fetching Khan Bank: ${url}`);

    try {
        const { data } = await axios.get(url, { httpsAgent: agent });
        const rates = Array.isArray(data) ? data : (data.data || []);
        const krw = rates.find(r => r.currency === 'KRW' || r.code === 'KRW');

        if (!krw) {
            console.error('❌ Khan Bank: KRW not found');
            return null;
        }

        console.log(`✅ Khan Bank (Non-Cash): Buy=${krw.buyRate}, Sell=${krw.sellRate}`);
        return {
            buy: parseFloat(krw.buyRate) || 0,
            sell: parseFloat(krw.sellRate) || 0,
            cashBuy: parseFloat(krw.cashBuyRate) || 0,
            cashSell: parseFloat(krw.cashSellRate) || 0,
            updatedAt: new Date().toISOString()
        };
    } catch (err) {
        console.error('❌ Khan Bank Fetch Error:', err.message);
        return null;
    }
}

// --- 2. Fetch Golomt Bank ---
async function fetchGolomtRates(dateStr) {
    const url = `https://www.golomtbank.com/api/exchange/?date=${dateStr}`;
    console.log(`📊 Fetching Golomt Bank: ${url}`);

    try {
        const { data } = await axios.get(url, {
            httpsAgent: agent,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        const krw = data?.result?.KRW;
        if (!krw) {
            console.error('❌ Golomt Bank: KRW not found in response');
            return null;
        }

        const buy = krw.non_cash_buy?.tvalue || krw.non_cash_buy?.cvalue || 0;
        const sell = krw.non_cash_sell?.tvalue || krw.non_cash_sell?.cvalue || 0;

        console.log(`✅ Golomt Bank (Non-Cash): Buy=${buy}, Sell=${sell}`);
        return {
            buy: parseFloat(buy) || 0,
            sell: parseFloat(sell) || 0,
            updatedAt: new Date().toISOString()
        };
    } catch (err) {
        console.error('❌ Golomt Bank Fetch Error:', err.message);
        return null;
    }
}

// --- 3. Fetch TDB ---
async function fetchTDBRates() {
    const url = 'https://www.tdbm.mn/mn/exchange-rates';
    console.log(`📊 Fetching TDB: ${url}`);

    try {
        const { data } = await axios.get(url, {
            httpsAgent: agent,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        const match = data.match(/<script type="application\/json" data-drupal-selector="drupal-settings-json">(.+?)<\/script>/);
        if (!match) {
            console.error('❌ TDB: JSON script tag not found');
            return null;
        }

        const json = JSON.parse(match[1]);
        const krw = json?.rates?.KRW;

        if (!krw) {
            console.error('❌ TDB: KRW rates not found in JSON');
            return null;
        }

        console.log(`✅ TDB (Non-Cash): Buy=${krw.noncash_buy}, Sell=${krw.noncash_sale}`);
        return {
            buy: parseFloat(krw.noncash_buy) || 0,
            sell: parseFloat(krw.noncash_sale) || 0,
            updatedAt: new Date().toISOString()
        };
    } catch (err) {
        console.error('❌ TDB Fetch Error:', err.message);
        return null;
    }
}

// --- Notification Logic ---
async function notifyAdmin(changes) {
    if (changes.length === 0) return;

    const BOT_ID = 'system-rates-bot';
    const BOT_NAME = 'Ханшийн Мэдээ';

    try {
        // 1. Check if conversation exists
        const chatsRef = db.collection('chats');
        const q = chatsRef.where('userId', '==', BOT_ID).limit(1);
        const snapshot = await q.get();

        let convRef;
        if (snapshot.empty) {
            // Create new conversation
            const newConv = await chatsRef.add({
                userId: BOT_ID,
                userName: BOT_NAME,
                createdAt: FieldValue.serverTimestamp(),
                lastMessage: 'Ханш шинэчлэгдлээ',
                lastMessageAt: FieldValue.serverTimestamp(),
                unreadByAdmin: 1,
                unreadByUser: 0,
                needsAdmin: true
            });
            convRef = newConv;
            console.log('🔔 Created new chat conversation for Rates Bot');
        } else {
            convRef = snapshot.docs[0].ref;
        }

        // 2. Add Message
        const messageText = `📉 **Ханшийн өөрчлөлт:**\n\n${changes.join('\n')}\n\n🕒 ${new Date().toLocaleString('mn-MN', { timeZone: 'Asia/Ulaanbaatar' })}`;

        await convRef.collection('messages').add({
            text: messageText,
            isFromAdmin: false, // User side (Bot)
            createdAt: FieldValue.serverTimestamp(),
            read: false,
            pinned: false,
            liked: false
        });

        // 3. Update Conversation Meta
        await convRef.update({
            lastMessage: messageText.substring(0, 50) + '...',
            lastMessageAt: FieldValue.serverTimestamp(),
            unreadByAdmin: FieldValue.increment(1),
            needsAdmin: true
        });

        console.log('🔔 Admin notification sent successfully.');

    } catch (error) {
        console.error('❌ Failed to send notification:', error);
    }
}

// --- Main Execution ---
async function updateRates() {
    console.log('==================================================');
    console.log('   BANK RATES UPDATER (MULTI-BANK)');
    console.log(`   ${new Date().toISOString()}`);
    console.log('==================================================');

    const dates = getDates();

    const [khan, golomt, tdbRates] = await Promise.all([
        fetchKhanRates(dates.khanDate),
        fetchGolomtRates(dates.golomtDate),
        fetchTDBRates()
    ]);

    const docRef = db.doc('settings/currency');
    const snap = await docRef.get();
    const existingData = snap.exists ? snap.data() : {};

    const changes = [];

    // Helper to check and log changes
    const checkChange = (bankName, type, newVal, oldVal) => {
        if (!oldVal) return; // First run, no comparison
        const diff = Math.abs(newVal - oldVal);
        // Using strict comparison or very small epsilon
        if (diff > 0.001) {
            const arrow = newVal > oldVal ? '⬆️' : '⬇️';
            // User requested explicit "Current" vs "New" display
            changes.push(`**${bankName} ${type}:**\n__Хуучин:__ ${oldVal} ➡️ __Шинэ:__ ${newVal} ${arrow}`);
        }
    };

    // Prepare Update Data
    const updateData = {
        lastUpdated: FieldValue.serverTimestamp(),
        updatedBy: 'GitHubActions'
    };

    if (khan) {
        updateData.khanRates = {
            cashBuy: khan.cashBuy,
            cashSell: khan.cashSell,
            nonCashBuy: khan.buy,
            nonCashSell: khan.sell,
            lastUpdated: khan.updatedAt
        };
        updateData.previousKhanRates = existingData.khanRates || null;

        // Check Khan Changes
        if (existingData.khanRates) {
            checkChange('Хаан', 'Авах', khan.buy, existingData.khanRates.nonCashBuy);
            checkChange('Хаан', 'Зарах', khan.sell, existingData.khanRates.nonCashSell);
        }
    }

    if (golomt) {
        updateData.golomtRates = {
            nonCashBuy: golomt.buy,
            nonCashSell: golomt.sell,
            lastUpdated: golomt.updatedAt
        };
        // Check Golomt Changes
        if (existingData.golomtRates) {
            checkChange('Голомт', 'Авах', golomt.buy, existingData.golomtRates.nonCashBuy);
            checkChange('Голомт', 'Зарах', golomt.sell, existingData.golomtRates.nonCashSell);
        }
    }

    if (tdbRates) {
        updateData.tdbRates = {
            nonCashBuy: tdbRates.buy,
            nonCashSell: tdbRates.sell,
            lastUpdated: tdbRates.updatedAt
        };
        // Check TDB Changes
        if (existingData.tdbRates) {
            checkChange('ХХБ', 'Авах', tdbRates.buy, existingData.tdbRates.nonCashBuy);
            checkChange('ХХБ', 'Зарах', tdbRates.sell, existingData.tdbRates.nonCashSell);
        }
    }

    // Determine if we should update & notify
    if (khan || golomt || tdbRates) {
        await docRef.set(updateData, { merge: true });
        console.log('✅ Firestore updated with available bank rates.');

        if (changes.length > 0) {
            console.log('⚠️ Rates changed! Sending notification...');
            await notifyAdmin(changes);
        } else {
            console.log('ℹ️ No significant rate changes.');
        }
    } else {
        console.warn('⚠️ No rates fetched from any bank. Firestore NOT updated.');
    }

    console.log('==================================================');
}

updateRates().catch(console.error);
