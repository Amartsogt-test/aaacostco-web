import { db } from '../firebase';
import {
    collection, addDoc, getDocs, query, where, orderBy, doc,
    updateDoc, deleteDoc, serverTimestamp, getDoc, setDoc, increment
} from 'firebase/firestore';

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

            // Update product aggregate rating
            await this._updateProductRating(productId);

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
            const snap = await getDocs(q);
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

    // Delete a review (admin or owner)
    async deleteReview(reviewId, productId) {
        try {
            await deleteDoc(doc(db, COLLECTION, reviewId));
            await this._updateProductRating(productId);
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
    },

    // Update aggregate rating on product
    async _updateProductRating(productId) {
        try {
            const reviews = await this.getProductReviews(productId);
            const count = reviews.length;
            const avg = count > 0
                ? reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / count
                : 0;

            // Store aggregate in products_rating collection (read-only for clients)
            await setDoc(doc(db, 'products_ratings', productId), {
                averageRating: Math.round(avg * 10) / 10,
                reviewCount: count,
                updatedAt: serverTimestamp()
            }, { merge: true });
        } catch (error) {
            console.error("Error updating product rating:", error);
        }
    },

    // Get aggregate rating for a product
    async getProductRating(productId) {
        try {
            const snap = await getDoc(doc(db, 'products_ratings', productId));
            if (snap.exists()) {
                return snap.data();
            }
            return { averageRating: 0, reviewCount: 0 };
        } catch {
            return { averageRating: 0, reviewCount: 0 };
        }
    }
};
