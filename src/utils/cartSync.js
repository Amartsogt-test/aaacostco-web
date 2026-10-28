// @ts-check
/**
 * cartSync.js — mirror a logged-in shopper's cart to Firestore (carts/{uid}) so
 * the abandonedCartReminder scheduled function can nudge them if they leave items
 * behind. Debounced; writes only a lightweight snapshot (count + timestamp), and
 * removes the doc when the cart is emptied. No-op for guests.
 */
import { useCartStore } from '../store/cartStore';
import { useAuthStore } from '../store/authStore';
import { cartApi } from '../services/apiClient';

let timer = null;
let lastUid = null;
let lastCount = -1;

export function startCartSync() {
    return useCartStore.subscribe((state) => {
        const uid = useAuthStore.getState().user?.uid;
        if (!uid) return;
        const itemCount =
            (state.groundItems || []).reduce((sum, i) => sum + (Number(i.quantity) || 1), 0) +
            (state.airItems || []).reduce((sum, i) => sum + (Number(i.quantity) || 1), 0);
        if (uid === lastUid && itemCount === lastCount) return;
        lastUid = uid;
        lastCount = itemCount;
        clearTimeout(timer);
        timer = setTimeout(async () => {
            try { await cartApi.save(itemCount); /* Worker (D1); also clears on 0 */ }
            catch { /* non-fatal */ }
        }, 2500);
    });
}
