import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useWishlistStore = create(
    persist(
        (set, get) => ({
            wishlist: [],
            // Price tracking: { [productId]: savedPrice }
            savedPrices: {},

            addToWishlist: (product) => {
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

            getCount: () => get().wishlist.length
        }),
        {
            name: 'shoppy-wishlist-storage', // unique name
        }
    )
);
