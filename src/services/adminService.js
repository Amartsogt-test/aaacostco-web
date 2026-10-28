// adminService — Cloudflare Worker only (Firestore removed).
// Category banners live on the D1 categories rows; the home carousel lives in the
// `home_banner` settings doc. Images upload to R2 via the Worker.
import { api, adminApi } from './apiClient';

export const adminService = {
    // Map of { categoryCode: bannerUrl } for categories that have a banner.
    async getCategoryBanners(menuData) {
        try {
            const r = await api.categories();
            const byId = {};
            for (const c of r?.categories || []) byId[c.id] = c.banner;
            const banners = {};
            for (const cat of menuData || []) { if (byId[cat.code]) banners[cat.code] = byId[cat.code]; }
            return banners;
        } catch (error) { console.error('Error loading banners:', error); throw error; }
    },

    async uploadBannerImage(file /*, categoryCode */) {
        try { return await adminApi.uploadImage(file); }
        catch (error) { console.error('Upload failed:', error); throw error; }
    },

    async saveBanner(categoryCode, newUrl) {
        try { await adminApi.setCategoryBanner(categoryCode, newUrl); return true; }
        catch (error) { console.error('Save failed:', error); throw error; }
    },

    async resetBanner(categoryCode) {
        try { await adminApi.setCategoryBanner(categoryCode, null); return true; }
        catch (error) { console.error('Reset failed:', error); throw error; }
    },

    // --- Home Banner (main carousel), stored in settings/home_banner ---
    async getHomeBanners() {
        try {
            const data = await api.settings('home_banner');
            return { items: data?.items || [], exchangeRateText: data?.exchangeRateText || null };
        } catch (error) { console.error('Error fetching home banners:', error); throw error; }
    },

    async uploadHomeBanner(file) {
        try { return await adminApi.uploadImage(file); }
        catch (error) { console.error('Home banner upload error:', error); throw error; }
    },

    async saveHomeBanners(banners, exchangeRateText = null, isActive = true) {
        try {
            const payload = { items: banners, isActive, updatedAt: new Date().toISOString() };
            if (exchangeRateText) payload.exchangeRateText = exchangeRateText;
            await adminApi.setSetting('home_banner', payload);
        } catch (error) { console.error('Error saving banners:', error); throw error; }
    },
};
