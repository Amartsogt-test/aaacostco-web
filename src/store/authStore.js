import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { auth, db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { FacebookAuthProvider, linkWithPopup } from 'firebase/auth';
import { orderService } from '../services/orderService';
import { useCartStore } from './cartStore';
import { useProductStore } from './productStore';

// Helper for Tier Calculation
// Loyalty tiers, measured in won (KRW):
//   Silver:   0 – 10,000,000
//   Gold:     10,000,000 – 20,000,000
//   Platinum: 20,000,000 +
const calculateTier = (amount) => {
    if (amount >= 20000000) return { tier: 'Platinum', nextTier: null, remain: 0 };
    if (amount >= 10000000) return { tier: 'Gold', nextTier: 'Platinum', remain: 20000000 - amount };
    return { tier: 'Silver', nextTier: 'Gold', remain: 10000000 - amount };
};

export const useAuthStore = create(
    persist(
        (set) => ({
            user: null, // { phone: string, name?: string, totalSpend?: number, tier?: 'Silver' | 'Gold' | 'Platinum', loginProvider?: 'facebook' | 'instagram', followStatus?: { facebook: null | boolean, instagram: null | boolean } }
            isAuthenticated: false,
            login: (userData) => {
                // Prefer the server-authoritative lifetime spend (totalSpendKRW), written
                // by the notifyOrderStage Cloud Function. Fall back to legacy totalSpend.
                const spendKRW = userData.totalSpendKRW ?? userData.totalSpend ?? 0;
                const tierInfo = calculateTier(spendKRW);
                set({
                    user: {
                        ...userData,
                        totalSpend: spendKRW,
                        ...tierInfo,
                        followStatus: userData.followStatus || { facebook: null, instagram: null }
                    },
                    isAuthenticated: true
                });
            },
            logout: () => set({ user: null, isAuthenticated: false }),
            updateFollowStatus: (platform, status) => set((state) => ({
                user: state.user ? {
                    ...state.user,
                    followStatus: {
                        ...state.user.followStatus,
                        [platform]: status
                    }
                } : null
            })),
            // Loyalty is measured in won; the caller passes the current wonRate so MNT
            // orders are normalised to KRW inside calculateUserSpend.
            refreshUserSpend: async (uid, phone, wonRate = 0) => {
                const totalSpend = await orderService.calculateUserSpend(uid, phone, wonRate);
                const tierInfo = calculateTier(totalSpend);

                set(state => ({
                    user: state.user ? { ...state.user, totalSpend, ...tierInfo } : null
                }));
            },
            syncUser: async (uid) => {
                if (!uid) return;
                try {
                    const userDoc = await getDoc(doc(db, 'users', uid));
                    if (userDoc.exists()) {
                        const userData = userDoc.data();

                        // Derive tier from the server-authoritative spend so the cart
                        // discount and profile always reflect the persisted membership.
                        const spendKRW = userData.totalSpendKRW ?? userData.totalSpend;
                        const tierInfo = (spendKRW !== undefined && spendKRW !== null)
                            ? { totalSpend: spendKRW, ...calculateTier(spendKRW) }
                            : {};

                        set(state => ({
                            user: state.user ? { ...state.user, ...userData, ...tierInfo } : null
                        }));

                        // Hydrate cart checkout state
                        if (userData.checkoutState) {
                            useCartStore.getState().setCheckoutState(userData.checkoutState);
                        }

                        // Hydrate cart items
                        if (userData.cart) {
                            const cartStore = useCartStore.getState();
                            if (userData.cart.groundItems) {
                                cartStore.setGroundItems(userData.cart.groundItems);
                            }
                            if (userData.cart.airItems) {
                                cartStore.setAirItems(userData.cart.airItems);
                            }
                        }

                        // Hydrate search history
                        if (userData.searchHistory) {
                            useProductStore.getState().setSearchHistory(userData.searchHistory);
                        }
                    }
                } catch (error) {
                    console.error("Failed to sync user:", error);
                }
            },
            updateUserProfile: async (uid, data) => {
                if (!uid) return;
                try {
                    await setDoc(doc(db, 'users', uid), data, { merge: true });
                    set(state => ({
                        user: state.user ? { ...state.user, ...data } : null
                    }));
                } catch (error) {
                    console.error("Failed to update user profile:", error);
                }
            },
            linkFacebook: async (currentUser) => {
                try {
                    // auth, db, doc, setDoc, FacebookAuthProvider, linkWithPopup are imported at the top

                    const user = currentUser;

                    if (!auth.currentUser) {
                        return { success: false, message: 'Firebase хэрэглэгч олдсонгүй.' };
                    }

                    const provider = new FacebookAuthProvider();
                    const result = await linkWithPopup(auth.currentUser, provider);
                    const fbUser = result.user;
                    const newData = {
                        name: fbUser.displayName,
                        photoURL: fbUser.photoURL,
                        fbUid: fbUser.providerData[0]?.uid,
                        isFacebookLinked: true
                    };

                    if (user?.uid) {
                        const userRef = doc(db, 'users', user.uid);
                        await setDoc(userRef, newData, { merge: true });
                    }

                    set(state => ({
                        user: state.user ? { ...state.user, ...newData } : null
                    }));

                    return { success: true, message: 'Facebook амжилттай холбогдлоо!' };

                } catch (error) {
                    console.error("Facebook Link Error:", error);
                    let msg = 'Facebook холбоход алдаа гарлаа: ' + error.message;
                    if (error.code === 'auth/credential-already-in-use') {
                        msg = 'Энэ Facebook хаяг өөр хэрэглэгчтэй холбогдсон байна.';
                    } else if (error.code === 'auth/popup-closed-by-user') {
                        msg = 'Cancelled';
                    }
                    return { success: false, message: msg };
                }
            }
        }),
        {
            name: 'auth-storage',
        }
    )
);
