import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useCartStore = create(
    persist(
        (set, get) => ({
            // Dual cart system: Ground (ship) and Air transport
            groundItems: [],
            airItems: [],

            // Checkout State (Global)
            checkoutState: {
                recipientName: '',
                recipientPhone: '',
                recipientPhone2: '',
                deliveryMode: 'pickup', // 'pickup' | 'delivery'
                selectedBranch: '',
                deliveryLocation: null,
                deliveryAddressInfo: '',
                koreaAddress: '',
                koreaPhone: '',
            },

            setCheckoutState: (newState) => set((state) => ({
                checkoutState: { ...state.checkoutState, ...newState }
            })),

            resetCheckoutState: () => set({
                checkoutState: {
                    recipientName: '',
                    recipientPhone: '',
                    recipientPhone2: '',
                    deliveryMode: 'pickup',
                    selectedBranch: '',
                    deliveryLocation: null,
                    deliveryAddressInfo: '',
                    koreaAddress: '',
                    koreaPhone: '',
                }
            }),

            // Add to Ground cart (газраар авах)
            addToGround: (product, selectedOptions = null, quantity = 1) => {
                const items = get().groundItems;
                const optionKey = selectedOptions
                    ? Object.values(selectedOptions).sort().join('_')
                    : '';
                const cartItemId = optionKey ? `${product.id}_${optionKey}` : product.id;

                const existingItem = items.find(item => item.cartItemId === cartItemId || (!item.cartItemId && item.id === product.id && !optionKey));

                if (existingItem) {
                    set({
                        groundItems: items.map(item =>
                            (item.cartItemId === cartItemId || (!item.cartItemId && item.id === product.id && !optionKey))
                                ? { ...item, quantity: item.quantity + quantity }
                                : item
                        ),
                    });
                } else {
                    set({
                        groundItems: [...items, {
                            ...product,
                            cartItemId,
                            selectedOptions,
                            transportType: 'ground',
                            quantity: quantity
                        }]
                    });
                }
            },

            // Add to Air cart (агаараар авах)
            addToAir: (product, selectedOptions = null, quantity = 1) => {
                const items = get().airItems;
                const optionKey = selectedOptions
                    ? Object.values(selectedOptions).sort().join('_')
                    : '';
                const cartItemId = optionKey ? `${product.id}_${optionKey}` : product.id;

                const existingItem = items.find(item => item.cartItemId === cartItemId || (!item.cartItemId && item.id === product.id && !optionKey));

                if (existingItem) {
                    set({
                        airItems: items.map(item =>
                            (item.cartItemId === cartItemId || (!item.cartItemId && item.id === product.id && !optionKey))
                                ? { ...item, quantity: item.quantity + quantity }
                                : item
                        ),
                    });
                } else {
                    set({
                        airItems: [...items, {
                            ...product,
                            cartItemId,
                            selectedOptions,
                            transportType: 'air',
                            quantity: quantity
                        }]
                    });
                }
            },

            // Remove from Ground cart
            removeFromGround: (cartItemId) => {
                set({
                    groundItems: get().groundItems.filter(item => (item.cartItemId || item.id) !== cartItemId)
                });
            },

            // Remove from Air cart
            removeFromAir: (cartItemId) => {
                set({
                    airItems: get().airItems.filter(item => (item.cartItemId || item.id) !== cartItemId)
                });
            },

            // Update quantity in Ground cart
            updateGroundQuantity: (cartItemId, quantity) => {
                if (quantity < 1) {
                    get().removeFromGround(cartItemId);
                    return;
                }
                set({
                    groundItems: get().groundItems.map(item =>
                        (item.cartItemId || item.id) === cartItemId ? { ...item, quantity } : item
                    ),
                });
            },

            // Update quantity in Air cart
            updateAirQuantity: (cartItemId, quantity) => {
                if (quantity < 1) {
                    get().removeFromAir(cartItemId);
                    return;
                }
                set({
                    airItems: get().airItems.map(item =>
                        (item.cartItemId || item.id) === cartItemId ? { ...item, quantity } : item
                    ),
                });
            },

            // Move item from Ground to Air
            moveToAir: (item) => {
                // 1. Remove from Ground
                get().removeFromGround(item.cartItemId || item.id);
                // 2. Add to Air (reuse existing logic logic or manual add)
                // We use manual add to ensure exact props transfer including quantity
                const currentAirItems = get().airItems;
                const existing = currentAirItems.find(i => (i.cartItemId || i.id) === (item.cartItemId || item.id));

                if (existing) {
                    // If exists in Air, just add quantity
                    set({
                        airItems: currentAirItems.map(i =>
                            (i.cartItemId || i.id) === (item.cartItemId || item.id)
                                ? { ...i, quantity: i.quantity + item.quantity }
                                : i
                        )
                    });
                } else {
                    // Else add new item with type Air
                    set({
                        airItems: [...currentAirItems, { ...item, transportType: 'air' }]
                    });
                }
            },

            // Move item from Air to Ground
            moveToGround: (item) => {
                // 1. Remove from Air
                get().removeFromAir(item.cartItemId || item.id);
                // 2. Add to Ground
                const currentGroundItems = get().groundItems;
                const existing = currentGroundItems.find(i => (i.cartItemId || i.id) === (item.cartItemId || item.id));

                if (existing) {
                    set({
                        groundItems: currentGroundItems.map(i =>
                            (i.cartItemId || i.id) === (item.cartItemId || item.id)
                                ? { ...i, quantity: i.quantity + item.quantity }
                                : i
                        )
                    });
                } else {
                    set({
                        groundItems: [...currentGroundItems, { ...item, transportType: 'ground' }]
                    });
                }
            },

            // Clear all carts
            clearCart: () => set({ groundItems: [], airItems: [] }),
            clearGround: () => set({ groundItems: [] }),
            clearAir: () => set({ airItems: [] }),

            // Totals
            totalGroundItems: () => get().groundItems.reduce((acc, item) => acc + item.quantity, 0),
            totalAirItems: () => get().airItems.reduce((acc, item) => acc + item.quantity, 0),
            totalItems: () => get().groundItems.reduce((acc, item) => acc + item.quantity, 0) + get().airItems.reduce((acc, item) => acc + item.quantity, 0),

            totalGroundPrice: () => get().groundItems.reduce((acc, item) => acc + (item.price?.value || item.price || 0) * item.quantity, 0),
            totalAirPrice: () => get().airItems.reduce((acc, item) => acc + (item.price?.value || item.price || 0) * item.quantity, 0),
            totalPrice: () => get().totalGroundPrice() + get().totalAirPrice(),

            // Helper: Check if product is in any cart
            isInGround: (productId) => get().groundItems.some(item => item.id === productId),
            isInAir: (productId) => get().airItems.some(item => item.id === productId),

            // Legacy compatibility: combined items as a function (not getter to avoid loops)
            getItems: () => [...get().groundItems, ...get().airItems],
        }),
        {
            name: 'costco-cart-storage',
        }
    )
);
