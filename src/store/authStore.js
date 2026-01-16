import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Helper for Tier Calculation
const calculateTier = (amount) => {
    if (amount >= 10000000) return { tier: 'Platinum', nextTier: null, remain: 0 };
    if (amount >= 5000000) return { tier: 'Gold', nextTier: 'Platinum', remain: 10000000 - amount };
    return { tier: 'Member', nextTier: 'Gold', remain: 5000000 - amount };
};

export const useAuthStore = create(
    persist(
        (set) => ({
            user: null, // { phone: string, name?: string, totalSpend?: number, tier?: 'Member' | 'Gold' | 'Platinum' }
            isAuthenticated: false,
            login: (userData) => {
                const tierInfo = calculateTier(userData.totalSpend || 0);
                set({
                    user: { ...userData, ...tierInfo },
                    isAuthenticated: true
                });
            },
            logout: () => set({ user: null, isAuthenticated: false }),
            refreshUserSpend: async (phoneNumber) => {
                const { orderService } = await import('../services/orderService');
                const totalSpend = await orderService.calculateUserSpend(phoneNumber);
                const tierInfo = calculateTier(totalSpend);

                set(state => ({
                    user: state.user ? { ...state.user, totalSpend, ...tierInfo } : null
                }));
            }
        }),
        {
            name: 'auth-storage',
        }
    )
);
