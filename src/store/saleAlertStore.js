import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useSaleAlertStore = create(
    persist(
        (set, get) => ({
            alerts: [], // List of product IDs

            toggleAlert: (productId) => set((state) => {
                if (state.alerts.includes(productId)) {
                    return { alerts: state.alerts.filter(id => id !== productId) };
                }
                return { alerts: [...state.alerts, productId] };
            }),

            isAlertActive: (productId) => get().alerts.includes(productId),

            removeAlert: (productId) => set((state) => ({
                alerts: state.alerts.filter(id => id !== productId)
            })),
        }),
        {
            name: 'sale-alert-storage',
        }
    )
);
