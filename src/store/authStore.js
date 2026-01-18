import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

// Helper for Tier Calculation
const calculateTier = (amount) => {
    if (amount >= 10000000) return { tier: 'Platinum', nextTier: null, remain: 0 };
    if (amount >= 5000000) return { tier: 'Gold', nextTier: 'Platinum', remain: 10000000 - amount };
    return { tier: 'Member', nextTier: 'Gold', remain: 5000000 - amount };
};

export const useAuthStore = create(
    persist(
        (set) => ({
            user: null, // { phone: string, name?: string, totalSpend?: number, tier?: 'Member' | 'Gold' | 'Platinum', loginProvider?: 'facebook' | 'instagram', followStatus?: { facebook: null | boolean, instagram: null | boolean } }
            isAuthenticated: false,
            login: (userData) => {
                const tierInfo = calculateTier(userData.totalSpend || 0);
                set({
                    user: {
                        ...userData,
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
            refreshUserSpend: async (phoneNumber) => {
                const { orderService } = await import('../services/orderService');
                const totalSpend = await orderService.calculateUserSpend(phoneNumber);
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
                        set(state => ({
                            user: state.user ? { ...state.user, ...userData } : null
                        }));
                    }
                } catch (error) {
                    console.error("Failed to sync user:", error);
                }
            },
            linkFacebook: async (currentUser) => {
                const { auth, db } = await import('../firebase');
                try {
                    // Dynamic imports 
                    const { doc, setDoc } = await import('firebase/firestore');
                    const { FacebookAuthProvider, linkWithPopup } = await import('firebase/auth');

                    const ADMIN_PHONE = import.meta.env.VITE_ADMIN_PHONE || '00880088';
                    const user = currentUser;
                    const isAdminBypass = user?.phone?.includes(ADMIN_PHONE) || user?.uid?.includes(ADMIN_PHONE);

                    if (isAdminBypass) {
                        const fakeFbUser = {
                            displayName: 'Bilguun Admin',
                            photoURL: 'https://graph.facebook.com/100000000000000/picture',
                            providerData: [{ uid: 'facebook:test:23568947' }]
                        };
                        const newData = {
                            name: fakeFbUser.displayName,
                            photoURL: fakeFbUser.photoURL,
                            fbUid: fakeFbUser.providerData[0]?.uid,
                            isFacebookLinked: true
                        };

                        if (user?.uid) {
                            const userRef = doc(db, 'users', user.uid);
                            await setDoc(userRef, newData, { merge: true });
                        }

                        set(state => ({
                            user: state.user ? { ...state.user, ...newData } : null
                        }));
                        return { success: true, message: 'Facebook амжилттай холбогдлоо! (Test Mode)' };
                    }

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
