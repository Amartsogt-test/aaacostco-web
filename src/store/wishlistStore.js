import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useAuthStore } from './authStore';
import { useUIStore } from './uiStore';

// Centralised login gate: saving requires a signed-in user (guarding here means
// no future "save" button can bypass the rule).
const requireAuthForSave = () => {
    if (useAuthStore.getState().user) return true;
    useUIStore.getState().showToast('Нэвтэрч орсоны дараа хадгалах боломжтой', 'warning');
    return false;
};

export const useWishlistStore = create(
    persist(
        (set, get) => ({
            wishlist: [],
            // Price tracking: { [productId]: savedPrice }
            savedPrices: {},
            // 📷 Labels scanned in-store whose product is NOT in our catalog yet.
            // Each: { code, name, brand, price, originalPrice, unitSize, scannedAt }
            scannedLabels: [],

            addToWishlist: (product) => {
                if (!requireAuthForSave()) return;
                const { wishlist, savedPrices } = get();
                // Check if already exists
                if (!wishlist.find(p => p.id === product.id)) {
                    const price = product.price || product.priceKRW || 0;
                    set({
                        wishlist: [...wishlist, product],
                        savedPrices: { ...savedPrices, [product.id]: price }
                    });
                }
            },

            removeFromWishlist: (productId) => {
                const { wishlist, savedPrices } = get();
                const { [productId]: _, ...remaining } = savedPrices;
                set({
                    wishlist: wishlist.filter(p => p.id !== productId),
                    savedPrices: remaining
                });
            },

            isInWishlist: (productId) => {
                return !!get().wishlist.find(p => p.id === productId);
            },

            toggleWishlist: (product) => {
                const { isInWishlist, addToWishlist, removeFromWishlist } = get();
                if (isInWishlist(product.id)) {
                    removeFromWishlist(product.id);
                } else {
                    addToWishlist(product);
                }
            },

            // Get products with price drops since added to wishlist
            getPriceDrops: (currentProducts = []) => {
                const { wishlist, savedPrices } = get();
                const drops = [];
                for (const saved of wishlist) {
                    const current = currentProducts.find(p => p.id === saved.id);
                    if (!current) continue;
                    const savedPrice = savedPrices[saved.id] || 0;
                    const currentPrice = current.price || current.priceKRW || 0;
                    if (savedPrice > 0 && currentPrice > 0 && currentPrice < savedPrice) {
                        drops.push({
                            product: current,
                            savedPrice,
                            currentPrice,
                            dropPercent: Math.round(((savedPrice - currentPrice) / savedPrice) * 100)
                        });
                    }
                }
                return drops;
            },

            clearWishlist: () => set({ wishlist: [], savedPrices: {} }),

            // --- Scanned in-store labels (product not in catalog) ---
            addScannedLabel: (label) => {
                if (!label || !label.code) return;
                const { scannedLabels } = get();
                // De-dup by code; newest first.
                const rest = scannedLabels.filter((l) => l.code !== label.code);
                set({ scannedLabels: [{ ...label, scannedAt: label.scannedAt || new Date().toISOString() }, ...rest] });
            },

            removeScannedLabel: (code) => {
                set({ scannedLabels: get().scannedLabels.filter((l) => l.code !== code) });
            },

            clearScannedLabels: () => set({ scannedLabels: [] }),

            getCount: () => get().wishlist.length
        }),
        {
            name: 'shoppy-wishlist-storage', // unique name
        }
    )
);
