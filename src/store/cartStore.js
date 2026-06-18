import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useUIStore } from './uiStore';
import { auth, db } from '../firebase';

// Hard customs cap: an individual's parcel stays duty-free only with ≤2 of the
// same item, so the cart never lets a single item exceed 2. The shopper is told
// to place the rest under another account (each recipient is assessed separately).
const MAX_SAME_ITEM_QTY = 2;
const SPLIT_MSG = 'Татваргүй авахын тулд ижил барааг 2 ширхэгээс хэтрүүлэхгүй. Үлдсэнийг өөр хэрэглэгчээр нэвтэрч захиалаарай.';
const notifyCap = () => useUIStore.getState().showToast(SPLIT_MSG, 'warning', 5000);

// 🛒 Guest checkout (international standard): the cart is open to everyone. No login
// is required to add items or check out — an anonymous Firebase session is created
// at order time (see ensureSignedIn in firebase.js) so Firestore rules are still
// satisfied without forcing the shopper to sign in first.

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
                recipientRegister: '', // регистрийн дугаар — customs (manifest) бүрдүүлэлтэд
                recipientCustomsAddress: '', // хүлээн авагчийн хаяг (pickup үед гаальд шаардлагатай)
                couponCode: '',       // applied promo code
                couponDiscount: 0,    // discount in the display currency
                deliveryMode: 'pickup', // 'pickup' | 'delivery'
                selectedBranch: '',
                deliveryLocation: null,
                deliveryAddressInfo: '',
                deliveryNotes: '',
                isAlternativeReceiver: false,
                koreaAddress: '',
                koreaPhone: '',
            },

            setCheckoutState: (newState) => {
                set((state) => ({
                    checkoutState: { ...state.checkoutState, ...newState }
                }));
                get().syncCartToFirestore();
            },

            resetCheckoutState: () => {
                set({
                    checkoutState: {
                        recipientName: '',
                        recipientPhone: '',
                        recipientPhone2: '',
                        recipientRegister: '',
                        recipientCustomsAddress: '',
                        couponCode: '',
                        couponDiscount: 0,
                        deliveryMode: 'pickup',
                        selectedBranch: '',
                        deliveryLocation: null,
                        deliveryAddressInfo: '',
                        deliveryNotes: '',
                        isAlternativeReceiver: false,
                        koreaAddress: '',
                        koreaPhone: '',
                    }
                });
                get().syncCartToFirestore();
            },

            setGroundItems: (items) => set({ groundItems: items }),
            setAirItems: (items) => set({ airItems: items }),

            syncCartToFirestore: async () => {
                if (window.__cartSyncTimeout) clearTimeout(window.__cartSyncTimeout);
                window.__cartSyncTimeout = setTimeout(async () => {
                    const { doc, setDoc } = await import('firebase/firestore');
                    const user = auth?.currentUser;
                    if (!user) return;
                    
                    try {
                        const { groundItems, airItems, checkoutState } = get();
                        await setDoc(doc(db, 'users', user.uid), {
                            cart: { groundItems, airItems },
                            checkoutState
                        }, { merge: true });
                    } catch (e) {
                        console.error("Failed to sync cart to Firestore:", e);
                    }
                }, 1500); // 1.5 second debounce
            },

            // Add to Ground cart (газраар авах)
            addToGround: (product, selectedOptions = null, quantity = 1) => {
                // Inactive / out-of-stock products are shown but NOT orderable.
                if (product?.status === 'inactive' || product?.stock === 'outOfStock') {
                    useUIStore.getState().showToast('Энэ бараа идэвхгүй байна — захиалах боломжгүй.', 'warning', 4000);
                    return false;
                }
                const items = get().groundItems;
                const optionKey = selectedOptions
                    ? Object.entries(selectedOptions).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${k}:${v}`).join('_')
                    : '';
                const cartItemId = optionKey ? `${product.id}_${optionKey}` : product.id;

                const existingItem = items.find(item => item.cartItemId === cartItemId || (!item.cartItemId && item.id === product.id && !optionKey));
                const existingQty = existingItem ? existingItem.quantity : 0;

                if (existingQty >= MAX_SAME_ITEM_QTY) { notifyCap(); return false; }
                const targetQty = Math.min(existingQty + quantity, MAX_SAME_ITEM_QTY);

                if (existingItem) {
                    set({
                        groundItems: items.map(item =>
                            (item.cartItemId === cartItemId || (!item.cartItemId && item.id === product.id && !optionKey))
                                ? { ...item, quantity: targetQty }
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
                            quantity: targetQty
                        }]
                    });
                }
                if (existingQty + quantity > MAX_SAME_ITEM_QTY) notifyCap();
                get().syncCartToFirestore();
                return true;
            },

            // Add to Air cart (агаараар авах)
            addToAir: (product, selectedOptions = null, quantity = 1) => {
                // Inactive / out-of-stock products are shown but NOT orderable.
                if (product?.status === 'inactive' || product?.stock === 'outOfStock') {
                    useUIStore.getState().showToast('Энэ бараа идэвхгүй байна — захиалах боломжгүй.', 'warning', 4000);
                    return false;
                }
                const items = get().airItems;
                const optionKey = selectedOptions
                    ? Object.entries(selectedOptions).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${k}:${v}`).join('_')
                    : '';
                const cartItemId = optionKey ? `${product.id}_${optionKey}` : product.id;

                const existingItem = items.find(item => item.cartItemId === cartItemId || (!item.cartItemId && item.id === product.id && !optionKey));
                const existingQty = existingItem ? existingItem.quantity : 0;

                if (existingQty >= MAX_SAME_ITEM_QTY) { notifyCap(); return false; }
                const targetQty = Math.min(existingQty + quantity, MAX_SAME_ITEM_QTY);

                if (existingItem) {
                    set({
                        airItems: items.map(item =>
                            (item.cartItemId === cartItemId || (!item.cartItemId && item.id === product.id && !optionKey))
                                ? { ...item, quantity: targetQty }
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
                            quantity: targetQty
                        }]
                    });
                }
                if (existingQty + quantity > MAX_SAME_ITEM_QTY) notifyCap();
                get().syncCartToFirestore();
                return true;
            },

            // Remove from Ground cart
            removeFromGround: (cartItemId) => {
                set({
                    groundItems: get().groundItems.filter(item => (item.cartItemId || item.id) !== cartItemId)
                });
                get().syncCartToFirestore();
            },

            // Remove from Air cart
            removeFromAir: (cartItemId) => {
                set({
                    airItems: get().airItems.filter(item => (item.cartItemId || item.id) !== cartItemId)
                });
                get().syncCartToFirestore();
            },

            // Update quantity in Ground cart
            updateGroundQuantity: (cartItemId, quantity) => {
                if (quantity < 1) {
                    get().removeFromGround(cartItemId);
                    return;
                }
                let q = quantity;
                if (q > MAX_SAME_ITEM_QTY) { q = MAX_SAME_ITEM_QTY; notifyCap(); }
                set({
                    groundItems: get().groundItems.map(item =>
                        (item.cartItemId || item.id) === cartItemId ? { ...item, quantity: q } : item
                    ),
                });
                get().syncCartToFirestore();
            },

            // Update quantity in Air cart
            updateAirQuantity: (cartItemId, quantity) => {
                if (quantity < 1) {
                    get().removeFromAir(cartItemId);
                    return;
                }
                let q = quantity;
                if (q > MAX_SAME_ITEM_QTY) { q = MAX_SAME_ITEM_QTY; notifyCap(); }
                set({
                    airItems: get().airItems.map(item =>
                        (item.cartItemId || item.id) === cartItemId ? { ...item, quantity: q } : item
                    ),
                });
                get().syncCartToFirestore();
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
                    // If exists in Air, merge quantity — capped at the customs limit.
                    set({
                        airItems: currentAirItems.map(i =>
                            (i.cartItemId || i.id) === (item.cartItemId || item.id)
                                ? { ...i, quantity: Math.min(i.quantity + item.quantity, MAX_SAME_ITEM_QTY) }
                                : i
                        )
                    });
                } else {
                    // Else add new item with type Air
                    set({
                        airItems: [...currentAirItems, { ...item, transportType: 'air', quantity: Math.min(item.quantity || 1, MAX_SAME_ITEM_QTY) }]
                    });
                }
                get().syncCartToFirestore();
            },

            // Move item from Air to Ground
            moveToGround: (item) => {
                // 1. Remove from Air
                get().removeFromAir(item.cartItemId || item.id);
                // 2. Add to Ground
                const currentGroundItems = get().groundItems;
                const existing = currentGroundItems.find(i => (i.cartItemId || i.id) === (item.cartItemId || item.id));

                if (existing) {
                    // Merge quantity — capped at the customs limit (mirrors moveToAir).
                    const merged = Math.min(existing.quantity + (item.quantity || 1), MAX_SAME_ITEM_QTY);
                    if (existing.quantity + (item.quantity || 1) > MAX_SAME_ITEM_QTY) notifyCap();
                    set({
                        groundItems: currentGroundItems.map(i =>
                            (i.cartItemId || i.id) === (item.cartItemId || item.id)
                                ? { ...i, quantity: merged }
                                : i
                        )
                    });
                } else {
                    set({
                        groundItems: [...currentGroundItems, { ...item, transportType: 'ground', quantity: Math.min(item.quantity || 1, MAX_SAME_ITEM_QTY) }]
                    });
                }
                get().syncCartToFirestore();
            },

            // Clear all carts
            clearCart: () => { set({ groundItems: [], airItems: [] }); get().syncCartToFirestore(); },
            clearGround: () => { set({ groundItems: [] }); get().syncCartToFirestore(); },
            clearAir: () => { set({ airItems: [] }); get().syncCartToFirestore(); },

            // Totals
            totalGroundItems: () => get().groundItems.reduce((acc, item) => acc + item.quantity, 0),
            totalAirItems: () => get().airItems.reduce((acc, item) => acc + item.quantity, 0),
            totalItems: () => get().groundItems.reduce((acc, item) => acc + item.quantity, 0) + get().airItems.reduce((acc, item) => acc + item.quantity, 0),

            // NOTE: monetary totals are intentionally NOT computed here — the cart's
            // real total (warehouse price + shipping + delivery, currency-converted)
            // is computed in CartContent.jsx and passed to checkout. A naive
            // base-price sum here would disagree with what the customer is charged.

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
