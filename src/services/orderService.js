import { db } from '../firebase';
import { collection, getDocs, updateDoc, doc, deleteDoc, query, orderBy, where, writeBatch } from 'firebase/firestore';
import { withRetry } from '../utils/async';

const COLLECTION_NAME = 'orders';

export const orderService = {
    // Fetch all orders (admin only)
    async getOrders() {
        try {
            const q = query(collection(db, COLLECTION_NAME), orderBy('date', 'desc'));
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error fetching orders: ", error);
            throw error;
        }
    },

    // Fetch orders for a specific user (by userId or phone)
    async getUserOrders(userId, userPhone) {
        try {
            // Primary query: by userId
            const q = query(
                collection(db, COLLECTION_NAME),
                where('userId', '==', userId),
                orderBy('date', 'desc')
            );
            const snapshot = await withRetry(() => getDocs(q));
            let orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Fallback: also check by phone number if we have it
            if (userPhone) {
                const cleanPhone = String(userPhone).replace(/\D/g, '');
                const phoneDigits = cleanPhone.startsWith('976') && cleanPhone.length === 11 ? cleanPhone.slice(3) : cleanPhone;
                const q2 = query(
                    collection(db, COLLECTION_NAME),
                    where('recipientPhone', '==', phoneDigits),
                    orderBy('date', 'desc')
                );
                const snap2 = await withRetry(() => getDocs(q2));
                const phoneOrders = snap2.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                // Merge, avoiding duplicates
                const existingIds = new Set(orders.map(o => o.id));
                for (const o of phoneOrders) {
                    if (!existingIds.has(o.id)) orders.push(o);
                }
                orders.sort((a, b) => new Date(b.date) - new Date(a.date));
            }

            return orders;
        } catch (error) {
            console.error("Error fetching user orders: ", error);
            throw error;
        }
    },

    async createOrder(orderData) {
        try {
            // Generate a random ID (e.g. DDHH + 4 random digits)
            const date = new Date();
            const dStr = String(date.getDate()).padStart(2, '0');
            const hStr = String(date.getHours()).padStart(2, '0');
            const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
            const orderId = `${dStr}${hStr}${random}`;

            const { doc, setDoc } = await import('firebase/firestore');
            await setDoc(doc(db, COLLECTION_NAME, orderId), orderData);
            
            return { id: orderId, ...orderData };
        } catch (error) {
            console.error("Error creating order: ", error);
            throw error;
        }
    },

    // Update order status
    async updateOrderStatus(orderId, status) {
        try {
            const orderRef = doc(db, COLLECTION_NAME, orderId);
            await updateDoc(orderRef, { status });
            return { id: orderId, status };
        } catch (error) {
            console.error("Error updating order status: ", error);
            throw error;
        }
    },

    // Update an order's fulfilment tracking. Admins have Firestore update
    // permission (see firestore.rules: orders allow update if isAdmin()), so this
    // writes directly — no Cloud Function needed. We persist the canonical
    // `trackingStage` + `trackingHistory` AND keep the legacy `status` in sync so
    // loyalty/revenue calculations that key off `status` keep working without a
    // data migration. `update` is the object returned by buildTrackingUpdate().
    async updateOrderTracking(orderId, update) {
        try {
            const { trackingStage, trackingHistory, status, cancelledAt } = update;
            const payload = { trackingStage, trackingHistory, status };
            if (cancelledAt) payload.cancelledAt = cancelledAt;
            await updateDoc(doc(db, COLLECTION_NAME, orderId), payload);
            return { id: orderId, ...payload };
        } catch (error) {
            console.error("Error updating order tracking: ", error);
            throw error;
        }
    },

    // Bulk-update fulfilment tracking for many orders at once — the real import
    // workflow: a whole batch (e.g. every order placed between the 10th–14th)
    // moves through customs / shipping together. Each order keeps its own
    // trackingHistory (computed per-order by buildTrackingUpdate), so we write
    // them in a single atomic Firestore batch (chunked at 450 < the 500-op cap).
    // `items`: [{ orderId, trackingStage, trackingHistory, status, cancelledAt }].
    async bulkUpdateOrderTracking(items) {
        try {
            for (let i = 0; i < items.length; i += 450) {
                const chunk = items.slice(i, i + 450);
                const batch = writeBatch(db);
                for (const it of chunk) {
                    const payload = { trackingStage: it.trackingStage, trackingHistory: it.trackingHistory, status: it.status };
                    if (it.cancelledAt) payload.cancelledAt = it.cancelledAt;
                    batch.update(doc(db, COLLECTION_NAME, it.orderId), payload);
                }
                await batch.commit();
            }
            return items.length;
        } catch (error) {
            console.error("Error bulk-updating order tracking: ", error);
            throw error;
        }
    },

    // Patch arbitrary safe fields on an order (admin only) — e.g. the courier
    // tracking number that links the order to the шуудан/courier system.
    async updateOrder(orderId, patch) {
        try {
            await updateDoc(doc(db, COLLECTION_NAME, orderId), patch);
            return { id: orderId, ...patch };
        } catch (error) {
            console.error("Error updating order: ", error);
            throw error;
        }
    },

    // Delete an order
    async deleteOrder(orderId) {
        try {
            await deleteDoc(doc(db, COLLECTION_NAME, orderId));
            return orderId;
        } catch (error) {
            console.error("Error deleting order: ", error);
            throw error;
        }
    },

    // Calculate total spend for a user, ALWAYS normalised to KRW (won) — the loyalty
    // tiers are defined in won (Gold ≥ 5,000,000, Platinum ≥ 10,000,000). Orders store
    // item.price in whatever currency the customer checked out with, so MNT orders are
    // converted back to won using `wonRate` (MNT = KRW × wonRate). Without this, the
    // same purchases would advance the tier differently depending on the currency the
    // customer happened to be viewing.
    //
    // Attributes orders by BOTH account uid and phone (union, de-duplicated) so
    // Facebook users — who have a uid but no phone — still accrue loyalty.
    // Client fallback for lifetime spend (₩). The server (notifyOrderStage CF) is the
    // source of truth and writes users/{uid}.totalSpendKRW; this mirrors that logic for
    // display before the server value exists. Spend counts an order once its payment is
    // confirmed (trackingStage confirmed-or-beyond, not cancelled). wonRate is unused now
    // — item prices are stored in ₩ — but kept for call-site compatibility.
    async calculateUserSpend(uid, phone /*, wonRate */) {
        const QUALIFYING = ['confirmed', 'purchased', 'warehouse', 'shipped', 'customs', 'arrived_ub', 'out_for_delivery', 'delivered'];
        const counts = (o) => QUALIFYING.includes(o.trackingStage) || (!o.trackingStage && o.status === 'Хүргэгдсэн');
        try {
            const orders = new Map(); // doc.id -> data (dedupes orders matched by both uid and phone)

            const collect = (snapshot) => {
                snapshot.forEach((d) => {
                    const data = d.data();
                    if (counts(data)) orders.set(d.id, data);
                });
            };

            // Each query is isolated so a permission rejection on one (e.g. the
            // phone query, which security rules may block since it isn't filtered by
            // userId) never discards the other query's valid results.
            if (uid) {
                try {
                    collect(await getDocs(query(collection(db, COLLECTION_NAME), where('userId', '==', uid))));
                } catch (e) { console.warn('Spend-by-uid query skipped:', e?.code || e?.message); }
            }

            if (phone) {
                try {
                    const digits = String(phone).replace(/\D/g, '');
                    const cleanPhone = digits.startsWith('976') && digits.length === 11 ? digits.slice(3) : digits;
                    collect(await getDocs(query(collection(db, COLLECTION_NAME), where('recipientPhone', '==', cleanPhone))));
                } catch (e) { console.warn('Spend-by-phone query skipped:', e?.code || e?.message); }
            }

            let totalSpend = 0;
            for (const order of orders.values()) {
                // Prefer the server-authoritative pre-discount value (₩); immune to the
                // legacy KRW/MNT ambiguity and to item.price being an object.
                const serverKRW = Number(order.priceAudit?.serverSubtotalKRW) || 0;
                if (serverKRW > 0) { totalSpend += serverKRW; continue; }
                // Fallback: sum item prices, which are stored in ₩ (object or number).
                if (!order.items) continue;
                totalSpend += order.items.reduce((acc, item) => {
                    const p = Number(item?.price?.value ?? item?.price) || 0;
                    return acc + p * (Number(item?.quantity) || 0);
                }, 0);
            }
            return Math.round(totalSpend);
        } catch (error) {
            console.error("Error calculating user spend:", error);
            return 0;
        }
    }
};
