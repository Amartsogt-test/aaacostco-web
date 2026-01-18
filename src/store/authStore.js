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
            }
        }),
        {
            name: 'auth-storage',
        }
    )
);
