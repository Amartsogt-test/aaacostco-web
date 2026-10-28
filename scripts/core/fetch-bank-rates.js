import axios from 'axios';
import https from 'https';
import fs from 'fs';
import path from 'path';

// --- Configuration ---
let db = null;
let FieldValue = null;
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.resolve(process.cwd(), 'functions/service-account.json');

async function initOptionalFirebase() {
    try {
        let serviceAccount = null;
        if (fs.existsSync(serviceAccountPath)) {
            serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
        } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        }

        if (serviceAccount) {
            const { initializeApp, cert } = await import('firebase-admin/app');
            const firestoreMod = await import('firebase-admin/firestore');
            FieldValue = firestoreMod.FieldValue;
            initializeApp({
                credential: cert(serviceAccount)
            });
            db = (process.env.FIRESTORE_DATABASE_ID && process.env.FIRESTORE_DATABASE_ID !== '(default)')
                ? firestoreMod.getFirestore(process.env.FIRESTORE_DATABASE_ID)
                : firestoreMod.getFirestore();
        } else {
            console.log('ℹ️ [Bank Rates] No Firebase service account found; running in direct D1 + local snapshot mode.');
        }
    } catch (err) {
        console.warn('⚠️ [Bank Rates] Firebase init skipped:', err.message);
    }
}
const fallbackTlsAgent = new https.Agent({ rejectUnauthorized: false });

async function fetchWithTlsFallback(url, options = {}) {
    try {
        return await axios.get(url, { timeout: 15000, ...options });
    } catch (err) {
        if (err?.code && String(err.code).includes('CERT') || String(err.code).includes('UNABLE_TO_VERIFY')) {
            return await axios.get(url, { timeout: 15000, ...options, httpsAgent: fallbackTlsAgent });
        }
        throw err;
    }
}

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
        const { data } = await fetchWithTlsFallback(url);
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
        const { data } = await fetchWithTlsFallback(url, {
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
        const { data } = await fetchWithTlsFallback(url, {
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
        const messageText = `📊 **ШИНЭЧЛЭГДСЭН ХАНШУУД**\n\n${changes.join('\n\n')}\n\n🕒 ${new Date().toLocaleString('mn-MN', { timeZone: 'Asia/Ulaanbaatar' })}`;

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
    await initOptionalFirebase();
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

    const docRef = db ? db.doc('settings/currency') : null;
    const snap = docRef ? await docRef.get() : null;
    const existingData = snap && snap.exists ? snap.data() : {};

    const bankChanges = {};

    // Helper to check and log changes
    const checkChange = (bankName, type, newVal, oldVal) => {
        if (!oldVal) return;
        const diff = Math.abs(newVal - oldVal);
        if (diff > 0.001) {
            const arrow = newVal > oldVal ? '🔺' : '🔻';
            if (!bankChanges[bankName]) bankChanges[bankName] = [];
            bankChanges[bankName].push(`• **${type}:** ${oldVal} ➜ **${newVal}** ${arrow}`);
        }
    };

    // Prepare Update Data
    const updateData = {
        lastUpdated: db ? FieldValue.serverTimestamp() : new Date().toISOString(),
        updatedBy: 'AutonomousSuite'
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
        updateData.previousGolomtRates = existingData.golomtRates || null;
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
        updateData.previousTdbRates = existingData.tdbRates || null;
        if (existingData.tdbRates) {
            checkChange('ХХБ', 'Авах', tdbRates.buy, existingData.tdbRates.nonCashBuy);
            checkChange('ХХБ', 'Зарах', tdbRates.sell, existingData.tdbRates.nonCashSell);
        }
    }

    // Convert grouped changes to strings for notification
    const changes = Object.entries(bankChanges).map(([bank, lines]) => {
        const emoji = bank === 'Хаан' ? '🏦' : bank === 'Голомт' ? '💳' : '💰';
        return `${emoji} **${bank} Банк**\n${lines.join('\n')}`;
    });

    // Determine if we should update & notify
    if (khan || golomt || tdbRates) {
        if (docRef) {
            const sellForDoc = Number(golomt?.sell || khan?.sell || tdbRates?.sell || 0);
            if (sellForDoc > 1.5 && sellForDoc < 5.0 && existingData.autoSyncRates !== false) {
                updateData.wonRate = sellForDoc;
            }
            await docRef.set(updateData, { merge: true });
            console.log('✅ Firestore updated with available bank rates.');
        }

        const effectiveSellRate = Number(golomt?.sell || khan?.sell || tdbRates?.sell || 0);
        const snapshotPath = path.resolve(process.cwd(), 'public/home-snapshot.json');
        if (effectiveSellRate > 1.5 && effectiveSellRate < 5.0 && fs.existsSync(snapshotPath)) {
            try {
                const snapJson = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
                snapJson.wonRate = effectiveSellRate;
                fs.writeFileSync(snapshotPath, JSON.stringify(snapJson), 'utf8');
                console.log(`✅ Updated public/home-snapshot.json wonRate = ${effectiveSellRate}`);
            } catch {
                /* ignore */
            }
        }

        const logsDir = path.resolve(process.cwd(), 'logs');
        fs.mkdirSync(logsDir, { recursive: true });
        fs.writeFileSync(
            path.join(logsDir, 'bank-rates.json'),
            JSON.stringify({ ...updateData, effectiveSellRate, lastUpdated: new Date().toISOString() }, null, 2),
            'utf8'
        );

        try {
            const { syncSettingToD1 } = await import('./d1-sync.js');
            const freshSnap = docRef ? await docRef.get() : null;
            const merged = freshSnap && freshSnap.exists ? freshSnap.data() : { ...existingData, ...updateData };
            if (effectiveSellRate > 1.5 && effectiveSellRate < 5.0 && merged.autoSyncRates !== false) {
                merged.wonRate = effectiveSellRate;
            }
            await syncSettingToD1('currency', {
                ...merged,
                lastUpdated: new Date().toISOString(),
            });
        } catch (e) {
            console.warn('⚠️ D1 currency sync warning:', e.message);
        }

        if (changes.length > 0 && db) {
            console.log('⚠️ Rates changed! Sending notification...');
            await notifyAdmin(changes);
        } else {
            console.log('ℹ️ No significant rate changes.');
        }
    } else {
        console.warn('⚠️ No rates fetched from any bank.');
    }

    console.log('==================================================');
}

updateRates().catch(console.error);
