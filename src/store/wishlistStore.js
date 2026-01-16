import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useWishlistStore = create(
    persist(
        (set, get) => ({
            wishlist: [],

            addToWishlist: (product) => {
                const { wishlist } = get();
                // Check if already exists
                if (!wishlist.find(p => p.id === product.id)) {
                    set({ wishlist: [...wishlist, product] });
                }
            },

            removeFromWishlist: (productId) => {
                const { wishlist } = get();
                set({ wishlist: wishlist.filter(p => p.id !== productId) });
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

            clearWishlist: () => set({ wishlist: [] }),

            getCount: () => get().wishlist.length
        }),
        {
            name: 'shoppy-wishlist-storage', // unique name
        }
    )
);
