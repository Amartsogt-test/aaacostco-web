import { create } from 'zustand';
import { settingsService } from '../services/settingsService';

export const useSettingsStore = create((set, get) => ({
    settings: null,
    isLoading: false,
    error: null,
    currencyRates: null,

    fetchSettings: async () => {
        if (get().settings) return; // Already loaded

        set({ isLoading: true });
        try {
            const data = await settingsService.getSettings();
            set({ settings: data || {}, isLoading: false });
        } catch (err) {
            set({ error: err.message, isLoading: false });
        }
    },

    // Call this if you want real-time updates
    subscribeToSettings: () => {
        set({ isLoading: true });
        return settingsService.subscribeToSettings((data) => {
            set({ settings: data || {}, isLoading: false });
        });
    },

    unsubscribeFromCurrency: null, // to keep track if needed

    updateSettings: async (newData) => {
        try {
            await settingsService.updateSettings(newData);
            // Optimistic update
            set(state => ({
                settings: { ...state.settings, ...newData }
            }));
        } catch (err) {
            console.error(err);
            throw err;
        }
    },

    subscribeToCurrencyRates: () => {
        return settingsService.subscribeToCurrency((data) => {
            set({ currencyRates: data || {} });
        });
    },

    refreshBankRates: async () => {
        try {
            await settingsService.triggerBankRefresh();
        } catch (err) {
            console.error(err);
            throw err;
        }
    }
}));
