import { create } from 'zustand';

export const useUIStore = create((set) => ({
    currency: 'KRW',
    exchangeRate: 0.408, // 1 KRW = 2.45 MNT -> 1 MNT ≈ 0.408 KRW
    toast: null, // { message: '', type: 'info' | 'error' | 'success' | 'warning' }
    showToast: (message, type = 'info') => set({ toast: { message, type } }),
    hideToast: () => set({ toast: null }),
    toggleCurrency: () => set((state) => ({ currency: state.currency === 'MNT' ? 'KRW' : 'MNT' })),
    isMenuOpen: false,
    openMenu: () => set({ isMenuOpen: true }),
    closeMenu: () => set({ isMenuOpen: false }),
    toggleMenu: () => set((state) => ({ isMenuOpen: !state.isMenuOpen })),
    isCartOpen: false,
    openCart: () => set({ isCartOpen: true }),
    closeCart: () => set({ isCartOpen: false }),
    toggleCart: () => set((state) => ({ isCartOpen: !state.isCartOpen })),
}));
