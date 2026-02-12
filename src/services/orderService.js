import { db } from '../firebase';
import { collection, getDocs, addDoc, updateDoc, doc, deleteDoc, query, orderBy, setDoc, where } from 'firebase/firestore';

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
            const snapshot = await getDocs(q);
            let orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Fallback: also check by phone number if we have it
            if (userPhone) {
                const cleanPhone = userPhone.replace(/\D/g, '');
                const phoneDigits = cleanPhone.startsWith('976') && cleanPhone.length === 11 ? cleanPhone.slice(3) : cleanPhone;
                const q2 = query(
                    collection(db, COLLECTION_NAME),
                    where('recipientPhone', '==', phoneDigits),
                    orderBy('date', 'desc')
                );
                const snap2 = await getDocs(q2);
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

    // Create a new order
    async createOrder(orderData, customId = null) {
        try {
            if (customId) {
                // Use custom ID (e.g., phone number)
                // Note: If ID exists, it overdrites.
                await setDoc(doc(db, COLLECTION_NAME, customId), {
                    ...orderData,
                    createdAt: new Date().toISOString()
                });
                return { id: customId, ...orderData };
            } else {
                // Auto-generated ID
                const docRef = await addDoc(collection(db, COLLECTION_NAME), {
                    ...orderData,
                    createdAt: new Date().toISOString()
                });
                return { id: docRef.id, ...orderData };
            }
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

    // Calculate total spend for a user (by phone number)
    async calculateUserSpend(phoneNumber) {
        try {
            const userDigits = phoneNumber.replace(/\D/g, '');
            const cleanPhone = userDigits.startsWith('976') && userDigits.length === 11 ? userDigits.slice(3) : userDigits;

            // Query only delivered orders for this phone (requires composite index: recipientPhone + status)
            const q = query(
                collection(db, COLLECTION_NAME),
                where('status', '==', 'Хүргэгдсэн'),
                where('recipientPhone', '==', cleanPhone)
            );

            let snapshot = await getDocs(q);

            // Fallback: try with original format if no results
            if (snapshot.empty && cleanPhone !== phoneNumber) {
                const q2 = query(
                    collection(db, COLLECTION_NAME),
                    where('status', '==', 'Хүргэгдсэн'),
                    where('recipientPhone', '==', phoneNumber)
                );
                snapshot = await getDocs(q2);
            }

            const totalSpend = snapshot.docs.reduce((sum, doc) => {
                const order = doc.data();
                if (!order.items) return sum;
                const orderTotal = order.items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
                return sum + orderTotal;
            }, 0);

            return totalSpend;
        } catch (error) {
            console.error("Error calculating user spend:", error);
            return 0;
        }
    }
};
