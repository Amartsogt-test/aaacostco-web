import { db, storage } from '../firebase';
import { doc, getDoc, setDoc, updateDoc, deleteField } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export const adminService = {
    // Fetch all category banners
    // returns map of { code: url }
    async getCategoryBanners(menuData) {
        try {
            const banners = {};
            const promises = menuData.map(async (cat) => {
                const docRef = doc(db, 'categories', cat.code);
                const snap = await getDoc(docRef);
                if (snap.exists() && snap.data().banner) {
                    banners[cat.code] = snap.data().banner;
                }
            });

            await Promise.all(promises);
            return banners;
        } catch (error) {
            console.error("Error loading banners:", error);
            throw error;
        }
    },

    // Upload banner image
    async uploadBannerImage(file, categoryCode) {
        try {
            const storageRef = ref(storage, `menu-images/${categoryCode}_${Date.now()}`);
            await uploadBytes(storageRef, file);
            return await getDownloadURL(storageRef);
        } catch (error) {
            console.error("Upload failed:", error);
            throw error;
        }
    },

    // Save banner URL to Firestore
    async saveBanner(categoryCode, newUrl) {
        try {
            const docRef = doc(db, 'categories', categoryCode);
            await setDoc(docRef, { banner: newUrl }, { merge: true });
            return true;
        } catch (error) {
            console.error("Save failed:", error);
            throw error;
        }
    },

    // Reset banner (delete field)
    async resetBanner(categoryCode) {
        try {
            const docRef = doc(db, 'categories', categoryCode);
            await updateDoc(docRef, { banner: deleteField() });
            return true;
        } catch (error) {
            console.error("Reset failed:", error);
            throw error;
        }
    },

    // --- Home Banner Logic (Main Carousel) ---

    async getHomeBanners() {
        try {
            const snap = await getDoc(doc(db, 'settings', 'home_banner'));
            if (snap.exists()) {
                const data = snap.data();
                return {
                    items: data.items || [],
                    exchangeRateText: data.exchangeRateText || null
                };
            }
            return { items: [], exchangeRateText: null };
        } catch (error) {
            console.error("Error fetching home banners:", error);
            throw error;
        }
    },

    async uploadHomeBanner(file) {
        try {
            const fileName = `banners/${Date.now()}_${file.name}`;
            const storageRef = ref(storage, fileName);
            const snapshot = await uploadBytes(storageRef, file);
            return await getDownloadURL(snapshot.ref);
        } catch (error) {
            console.error("Home banner upload error:", error);
            throw error;
        }
    },

    async saveHomeBanners(banners, exchangeRateText = null) {
        try {
            const payload = {
                items: banners,
                updatedAt: new Date().toISOString()
            };
            if (exchangeRateText) {
                payload.exchangeRateText = exchangeRateText;
            }

            await setDoc(doc(db, 'settings', 'home_banner'), payload, { merge: true });
            return true;
        } catch (error) {
            console.error("Save home banners error:", error);
            throw error;
        }
    }
};
