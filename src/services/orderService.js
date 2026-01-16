import { db } from '../firebase';
import { collection, getDocs, addDoc, updateDoc, doc, deleteDoc, query, orderBy, setDoc } from 'firebase/firestore';

const COLLECTION_NAME = 'orders';

export const orderService = {
    // Fetch all orders
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
            // Normalize phone: if it starts with +976, we might need to handle variants,
            // but usually orders are saved with whatever was input.
            // We'll search for exact match or substring if needed, but for now exact match on 'phone' field.

            // Note: This requires an index on 'phone' and 'status' if we filter by both.
            // For now, let's fetch by phone and filter by status in memory to avoid composite index requirement immediately if not set.
            const q = query(collection(db, COLLECTION_NAME), orderBy('date', 'desc'));
            // Ideally: where('contacts.phone', '==', phoneNumber) or similar.
            // But orders structure is: { items: [...], recipient: { phone: ... }, ... }
            // Let's check how recipient phone is stored. In Cart.jsx: recipientPhone.

            const snapshot = await getDocs(q);
            const userDigits = phoneNumber.replace(/\D/g, '');
            const cleanPhone = userDigits.startsWith('976') && userDigits.length === 11 ? userDigits.slice(3) : userDigits;

            const userOrders = snapshot.docs
                .map(doc => doc.data())
                .filter(order => {
                    const orderPhone = order.recipientPhone ? order.recipientPhone.toString().replace(/\D/g, '') : '';
                    return (orderPhone === cleanPhone || order.recipientPhone === phoneNumber) && order.status === 'Хүргэгдсэн';
                });

            const totalSpend = userOrders.reduce((sum, order) => {
                // Calculate order total. 
                // Order structure usually has 'total' or we sum items.
                // Let's assume order.items has price * quantity.
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
