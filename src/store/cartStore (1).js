import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useCartStore = create(
    persist(
        (set, get) => ({
            items: [],

            addToCart: (product, selectedOptions = null) => {
                const items = get().items;
                // Create unique ID for variants: "productId_optionValue1_optionValue2"
                const optionKey = selectedOptions
                    ? Object.values(selectedOptions).sort().join('_')
                    : '';
                const cartItemId = optionKey ? `${product.id}_${optionKey}` : product.id;

                const existingItem = items.find(item => item.cartItemId === cartItemId || (!item.cartItemId && item.id === product.id && !optionKey));

                if (existingItem) {
                    set({
                        items: items.map(item =>
                            (item.cartItemId === cartItemId || (!item.cartItemId && item.id === product.id && !optionKey))
                                ? { ...item, quantity: item.quantity + 1 }
                                : item
                        ),
                    });
                } else {
                    set({
                        items: [...items, {
                            ...product,
                            cartItemId, // Unique ID for cart management
                            selectedOptions,
                            quantity: 1
                        }]
                    });
                }
            },

            removeFromCart: (cartItemId) => {
                set({
                    items: get().items.filter(item => (item.cartItemId || item.id) !== cartItemId)
                });
            },

            updateQuantity: (cartItemId, quantity) => {
                if (quantity < 1) {
                    get().removeFromCart(cartItemId);
                    return;
                }
                set({
                    items: get().items.map(item =>
                        (item.cartItemId || item.id) === cartItemId ? { ...item, quantity } : item
                    ),
                });
            },

            clearCart: () => set({ items: [] }),

            totalItems: () => get().items.reduce((acc, item) => acc + item.quantity, 0),
            totalPrice: () => get().items.reduce((acc, item) => acc + item.price * item.quantity, 0),
        }),
        {
            name: 'costco-cart-storage',
        }
    )
);
