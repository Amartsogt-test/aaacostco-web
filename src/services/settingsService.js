import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export const settingsService = {
    // Get all settings once
    getSettings: async () => {
        try {
            const docRef = doc(db, 'settings', 'general');
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                return docSnap.data();
            }
            return null;
        } catch (error) {
            console.error("Error fetching settings:", error);
            throw error;
        }
    },

    // Subscribe to settings changes (real-time)
    subscribeToSettings: (callback) => {
        const docRef = doc(db, 'settings', 'general');
        return onSnapshot(docRef, (doc) => {
            if (doc.exists()) {
                callback(doc.data());
            } else {
                callback(null);
            }
        });
    },

    // Update settings
    updateSettings: async (data) => {
        try {
            const docRef = doc(db, 'settings', 'general');
            await setDoc(docRef, data, { merge: true });
        } catch (error) {
            console.error("Error updating settings:", error);
            throw error;
        }
    },

    // Get Scraper Settings
    getScraperSettings: async () => {
        try {
            const docRef = doc(db, 'settings', 'scraper');
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                return docSnap.data();
            }
            return null;
        } catch (error) {
            console.error("Error fetching scraper settings:", error);
            throw error;
        }
    },

    // Update Scraper Settings
    updateScraperSettings: async (data) => {
        try {
            const docRef = doc(db, 'settings', 'scraper');
            await setDoc(docRef, data, { merge: true });
        } catch (error) {
            console.error("Error updating scraper settings:", error);
            throw error;
        }
    },

    // Subscribe to Currency Rates
    subscribeToCurrency: (callback) => {
        const docRef = doc(db, 'settings', 'currency');
        return onSnapshot(docRef, (doc) => {
            if (doc.exists()) {
                callback(doc.data());
            } else {
                callback(null);
            }
        });
    },

    // Trigger backend function to refresh rates
    triggerBankRefresh: async () => {
        try {
            const docRef = doc(db, 'settings', 'currency');
            await setDoc(docRef, { refreshTrigger: true }, { merge: true });
        } catch (error) {
            console.error("Error triggering bank refresh:", error);
            throw error;
        }
    }
};
