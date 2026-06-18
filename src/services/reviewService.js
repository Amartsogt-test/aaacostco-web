import { db } from '../firebase';
import {
    collection, addDoc, getDocs, query, where, orderBy, doc,
    updateDoc, deleteDoc, serverTimestamp, increment
} from 'firebase/firestore';
import { withRetry } from '../utils/async';

const COLLECTION = 'reviews';

export const reviewService = {

    // Add a review for a product
    async addReview({ productId, userId, userName, rating, comment, userPhone }) {
        try {
            // Prevent duplicate reviews from same user
            const existing = query(
                collection(db, COLLECTION),
                where('productId', '==', productId),
                where('userId', '==', userId)
            );
            const snap = await getDocs(existing);
            if (!snap.empty) {
                throw new Error('Та энэ бараанд аль хэдийн сэтгэгдэл бичсэн байна.');
            }

            const reviewData = {
                productId,
                userId,
                userName: userName || 'Хэрэглэгч',
                userPhone: userPhone || '',
                rating: Math.min(5, Math.max(1, rating)),
                comment: comment?.trim() || '',
                createdAt: serverTimestamp(),
                helpful: 0
            };

            const docRef = await addDoc(collection(db, COLLECTION), reviewData);

            // The product aggregate (products_ratings) is recomputed server-side by
            // the recalcProductRating Cloud Function — clients can no longer write it,
            // which closes a tampering hole (Firestore rules deny client writes there).

            return { id: docRef.id, ...reviewData };
        } catch (error) {
            console.error("Error adding review:", error);
            throw error;
        }
    },

    // Get all reviews for a product
    async getProductReviews(productId) {
        try {
            const q = query(
                collection(db, COLLECTION),
                where('productId', '==', productId),
                orderBy('createdAt', 'desc')
            );
            const snap = await withRetry(() => getDocs(q));
            return snap.docs.map(d => ({
                id: d.id,
                ...d.data(),
                createdAt: d.data().createdAt?.toDate?.()?.toISOString() || new Date().toISOString()
            }));
        } catch (error) {
            console.error("Error fetching reviews:", error);
            return [];
        }
    },

    // Delete a review (admin or owner). The products_ratings aggregate is refreshed
    // server-side by the recalcProductRating Cloud Function.
    async deleteReview(reviewId) {
        try {
            await deleteDoc(doc(db, COLLECTION, reviewId));
        } catch (error) {
            console.error("Error deleting review:", error);
            throw error;
        }
    },

    // Mark review as helpful
    async markHelpful(reviewId) {
        try {
            await updateDoc(doc(db, COLLECTION, reviewId), {
                helpful: increment(1)
            });
        } catch (error) {
            console.error("Error marking helpful:", error);
        }
    }
};
