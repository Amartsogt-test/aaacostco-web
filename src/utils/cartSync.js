// @ts-check
/**
 * cartSync.js — mirror a logged-in shopper's cart to Firestore (carts/{uid}) so
 * the abandonedCartReminder scheduled function can nudge them if they leave items
 * behind. Debounced; writes only a lightweight snapshot (count + timestamp), and
 * removes the doc when the cart is emptied. No-op for guests.
 */
import { useCartStore } from '../store/cartStore';
import { useAuthStore } from '../store/authStore';
import { db } from '../firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';

let timer = null;

export function startCartSync() {
    return useCartStore.subscribe((state) => {
        const uid = useAuthStore.getState().user?.uid;
        if (!uid) return;
        const itemCount = (state.groundItems?.length || 0) + (state.airItems?.length || 0);
        clearTimeout(timer);
        timer = setTimeout(async () => {
            try {
                const ref = doc(db, 'carts', uid);
                if (itemCount > 0) {
                    await setDoc(ref, { uid, itemCount, updatedAt: new Date().toISOString(), reminded: false }, { merge: true });
                } else {
                    await deleteDoc(ref).catch(() => { });
                }
            } catch { /* non-fatal */ }
        }, 2500);
    });
}
