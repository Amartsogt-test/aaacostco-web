import { db } from '../firebase';
import {
    collection,
    doc,
    setDoc,
    getDoc,
    runTransaction,
    query,
    where,
    orderBy,
    getDocs,
    serverTimestamp,
    Timestamp
} from 'firebase/firestore';

/**
 * Generates a random alphanumeric code
 * Format: XXXX-XXXX-XXXX (12 chars)
 */
const generateCardCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 1, 0 to avoid confusion
    let result = '';
    for (let i = 0; i < 12; i++) {
        if (i > 0 && i % 4 === 0) result += '-';
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

export const giftCardService = {
    /**
     * Create a new Gift Card
     * @param {Object} data - { amount: number, createdBy: string, recipientPhone?: string, message?: string, expiresDays?: number }
     */
    createGiftCard: async (data) => {
        try {
            // Generate unique code (retry if exists - unlikely)
            let code = generateCardCode();
            let ref = doc(db, 'gift_cards', code);
            let snap = await getDoc(ref);

            // Simple retry logic once for collision
            if (snap.exists()) {
                code = generateCardCode();
                ref = doc(db, 'gift_cards', code);
            }

            const now = new Date();
            let expiresAt = null;
            if (data.expiresDays) {
                const expDate = new Date();
                expDate.setDate(now.getDate() + data.expiresDays);
                expiresAt = Timestamp.fromDate(expDate);
            }

            const giftCard = {
                code,
                balance: Number(data.amount),
                initialValue: Number(data.amount),
                currency: 'MNT',
                status: 'active',
                createdAt: serverTimestamp(),
                createdBy: data.createdBy, // Admin UID or Name

                // Optional Recipient
                recipientPhone: data.recipientPhone || null,
                message: data.message || '',

                expiresAt: expiresAt,

                // Design
                designId: data.designId || 'default'
            };

            await setDoc(ref, giftCard);
            return { success: true, code, giftCard };
        } catch (error) {
            console.error("Error creating gift card:", error);
            throw error;
        }
    },

    /**
     * Validate a Gift Card Code
     * @returns {Object} { isValid, balance, card, error }
     */
    validateGiftCard: async (code) => {
        try {
            const cleanCode = code.trim().toUpperCase();
            const ref = doc(db, 'gift_cards', cleanCode);
            const snap = await getDoc(ref);

            if (!snap.exists()) {
                return { isValid: false, error: 'Код буруу байна.' };
            }

            const card = snap.data();

            if (card.status !== 'active') {
                return { isValid: false, error: 'Энэ карт идэвхгүй байна.' };
            }

            if (card.balance <= 0) {
                return { isValid: false, error: 'Картын үлдэгдэл хүрэлцэхгүй байна.' };
            }

            if (card.expiresAt) {
                const now = new Date();
                const exp = card.expiresAt.toDate();
                if (now > exp) {
                    return { isValid: false, error: 'Картын хугацаа дууссан байна.' };
                }
            }

            return { isValid: true, balance: card.balance, card };

        } catch (error) {
            console.error("Error validating card:", error);
            return { isValid: false, error: 'Шалгах үед алдаа гарлаа.' };
        }
    },

    /**
     * Redeem (Use) a Gift Card using Transaction
     * @param {string} code 
     * @param {number} amountToUse 
     * @param {string} orderId 
     * @param {string} userId 
     */
    redeemGiftCard: async (code, amountToUse, orderId, userId) => {
        const cleanCode = code.trim().toUpperCase();
        const cardRef = doc(db, 'gift_cards', cleanCode);

        try {
            await runTransaction(db, async (transaction) => {
                const sfDoc = await transaction.get(cardRef);
                if (!sfDoc.exists()) {
                    throw "Card does not exist!";
                }

                const card = sfDoc.data();
                if (card.status !== 'active' || card.balance < amountToUse) {
                    throw "Insufficient balance or inactive card";
                }

                const newBalance = card.balance - amountToUse;
                const newStatus = newBalance === 0 ? 'fully_used' : 'active';

                // 1. Update Card
                transaction.update(cardRef, {
                    balance: newBalance,
                    status: newStatus,
                    lastUsedAt: serverTimestamp()
                });

                // 2. Create Transaction Record
                const newTxRef = doc(collection(db, 'gift_card_transactions'));
                transaction.set(newTxRef, {
                    code: cleanCode,
                    amount: amountToUse,
                    orderId: orderId || 'manual',
                    userId: userId || 'anonymous',
                    timestamp: serverTimestamp(),
                    type: 'redemption'
                });
            });

            return { success: true };
        } catch (e) {
            console.error("Redeem Transaction failed: ", e);
            throw e;
        }
    },

    /**
     * Get All Gift Cards (Admin)
     */
    getAllGiftCards: async () => {
        const q = query(collection(db, 'gift_cards'), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ ...d.data(), id: d.id }));
    },

    /**
     * Get User's Gift Cards (by phone)
     */
    getUserGiftCards: async (phone) => {
        if (!phone) return [];
        // Filter by recipientPhone match
        const q = query(collection(db, 'gift_cards'), where('recipientPhone', '==', phone));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ ...d.data(), id: d.id }));
    }
};
