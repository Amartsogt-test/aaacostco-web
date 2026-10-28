// productService — Cloudflare Worker + CDN only (Firestore removed).
//
// Catalog reads come from the edge Worker (D1) and static CDN snapshots; admin writes go
// through the Worker admin API (D1 + R2). Pagination is now OFFSET-based: getPaginatedProducts
// returns `lastVisible` as the next numeric offset (an opaque cursor token the store passes
// back), so productStore's page/cursor bookkeeping keeps working unchanged.
import { api, adminApi } from './apiClient';

// Special-rail category → catalog tag mapping (was separate Firestore collections).
const SPECIAL_TAG = { Sale: 'Sale', New: 'New', Kirkland: 'Kirkland Signature', Featured: 'Featured' };

let _homeSnapshotPromise = null;
let _homeSnapshotData = null;
let _searchIndexPromise = null;
let _searchIndexData = null;

export const productService = {
    // ---- Admin writes -------------------------------------------------------
    async addProduct(productData, imageFile, videoFile) {
        try {
            let imageUrl = productData.image;
            let videoUrl = productData.video;
            if (imageFile) imageUrl = await adminApi.uploadImage(imageFile);
            if (videoFile) videoUrl = await adminApi.uploadImage(videoFile);
            const cleanData = Object.fromEntries(
                Object.entries({ ...productData, image: imageUrl, video: videoUrl, createdAt: new Date().toISOString() })
                    .filter(([, v]) => v !== undefined)
            );
            const id = String(cleanData.id || cleanData.code || `manual_${Date.now()}`);
            await adminApi.upsertProduct({ ...cleanData, id });
            return { id, ...cleanData };
        } catch (error) { console.error('Error adding product:', error); throw error; }
    },

    async updateProduct(id, productData, imageFile, videoFile) {
        try {
            let imageUrl = productData.image;
            let videoUrl = productData.video;
            if (imageFile) imageUrl = await adminApi.uploadImage(imageFile);
            if (videoFile) videoUrl = await adminApi.uploadImage(videoFile);
            const cleanData = Object.fromEntries(
                Object.entries({ ...productData, image: imageUrl, video: videoUrl, updatedAt: new Date().toISOString() })
                    .filter(([, v]) => v !== undefined)
            );
            await adminApi.upsertProduct({ ...cleanData, id: String(id) });
            return { id, ...cleanData };
        } catch (error) { console.error('Error updating product:', error); throw error; }
    },

    async updateStatus(id, status) {
        try { await adminApi.upsertProduct({ id: String(id), status, updatedAt: new Date().toISOString() }); return true; }
        catch (error) { console.error('Error updating status:', error); throw error; }
    },

    async deleteProduct(id) {
        try { await adminApi.deleteProduct(String(id)); return true; }
        catch (error) { console.error('Error deleting product:', error); throw error; }
    },

    // ---- Static CDN fallbacks (no backend) ---------------------------------
    async getFallbackProducts() {
        try {
            const response = await fetch('/products_cache.json');
            if (response.ok) {
                const data = await response.json();
                data.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
                return { products: data, lastVisible: null };
            }
        } catch (e) { console.error('Fallback failed:', e); }
        return { products: [], lastVisible: null };
    },

    // ---- Catalog reads (Worker / D1) ---------------------------------------
    async getSpecialCategoryProducts(categoryType) {
        const tag = SPECIAL_TAG[categoryType];
        if (!tag) { console.error(`Unknown category type: ${categoryType}`); return []; }
        try {
            const r = await api.products({ tag, limit: 200 });
            return r?.products || [];
        } catch (error) { console.error(`Error fetching ${categoryType}:`, error); return []; }
    },

    async getInactiveProducts() {
        try { return (await adminApi.products('inactive'))?.products || []; }
        catch (error) { console.error('Error fetching inactive products:', error); return []; }
    },

    async getDeletedProducts() {
        try { return (await adminApi.products('deleted'))?.products || []; }
        catch (error) { console.error('Error fetching deleted products:', error); return []; }
    },

    async getHomeProducts(limitCount = 0) {
        try {
            const r = await api.products({ status: 'catalog', limit: limitCount > 0 ? Math.min(limitCount, 200) : 200 });
            const products = (r?.products || []).map((p) => ({
                ...p,
                price: p.price || p.priceKRW || 0,
                originalPrice: p.originalPrice || p.originalPriceKRW || 0,
            }));
            if (!products.length) return this.getAllSpecialProducts(40);
            return products;
        } catch (error) {
            console.error('Error fetching home products:', error);
            return this.getAllSpecialProducts(40);
        }
    },

    // Static home snapshot served from the CDN (generated by costco-kr-full-sync.js).
    // Deduplicates concurrent calls on initial load so /home-snapshot.json is only fetched once.
    async getHomeSnapshot(forceRefresh = false) {
        if (!forceRefresh && _homeSnapshotData) return _homeSnapshotData;
        if (!forceRefresh && _homeSnapshotPromise) return _homeSnapshotPromise;
        _homeSnapshotPromise = (async () => {
            try {
                const res = await fetch('/home-snapshot.json', { cache: 'default' });
                if (!res.ok) return null;
                const data = await res.json();
                if (!data || !Array.isArray(data.products) || data.products.length === 0) return null;
                _homeSnapshotData = data;
                return data;
            } catch {
                return null;
            } finally {
                _homeSnapshotPromise = null;
            }
        })();
        return _homeSnapshotPromise;
    },

    // No Firestore sync_info doc anymore; the CDN snapshot carries generatedAt.
    async getHomeSyncInfo() {
        const snap = await this.getHomeSnapshot();
        return snap ? { lastSync: snap.generatedAt, productCount: snap.productCount } : null;
    },

    async getAllSpecialProducts(limitPerTag = 40) {
        try {
            const tags = ['Sale', 'New', 'Kirkland Signature', 'Featured'];
            const productMap = new Map();
            const lists = await Promise.all(tags.map((tag) =>
                api.products({ tag, limit: limitPerTag }).then((r) => r?.products || []).catch(() => [])
            ));
            lists.flat().forEach((p) => { if (p?.id && !productMap.has(p.id)) productMap.set(p.id, p); });
            return Array.from(productMap.values());
        } catch (error) { console.error('Error fetching all special products:', error); return []; }
    },

    // OFFSET-based pagination. `lastDoc` is the previous call's `lastVisible` (a numeric
    // offset) or null for page 1. Returns { products, lastVisible: nextOffset|null }.
    async getPaginatedProducts(lastDoc = null, pageSize = 40, filters = {}) {
        try {
            const { category, subCategory, tag } = filters;
            const offset = typeof lastDoc === 'number' ? lastDoc : 0;
            const params = { status: 'catalog', limit: pageSize, offset };
            if (category) params.category = category;
            if (subCategory) params.subCategory = subCategory;
            if (tag) params.tag = tag;
            const r = await api.products(params);
            const products = r?.products || [];
            const lastVisible = products.length === pageSize ? offset + pageSize : null;
            return { products, lastVisible };
        } catch (error) { console.error('Error fetching products:', error); throw error; }
    },

    async getProductCount(filters = {}) {
        try {
            const { category, subCategory, tag } = filters;
            const params = {};
            if (category) params.category = category;
            if (subCategory) params.subCategory = subCategory;
            if (tag) params.tag = tag;
            const r = await api.productsCount(params);
            return Number(r?.count) || 0;
        } catch (error) { console.error('Error fetching count:', error); return 0; }
    },

    async getAllCategoryCounts() {
        const CACHE_KEY = 'costco_category_counts_v3';
        const TTL_MS = 30 * 60 * 1000;
        try {
            const raw = typeof localStorage !== 'undefined' && localStorage.getItem(CACHE_KEY);
            if (raw) {
                const cached = JSON.parse(raw);
                if (cached && cached.t && (Date.now() - cached.t) < TTL_MS && cached.counts) return cached.counts;
            }
        } catch { /* ignore cache read errors */ }
        try {
            const r = await api.categoryCounts();
            const counts = r?.counts || {};
            try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), counts })); } catch { /* quota */ }
            return counts;
        } catch (error) { console.error('Error fetching all category counts:', error); return {}; }
    },

    // Single product by id (edge Worker / D1, with automatic fallback to CDN snapshot & search-index).
    // Retries once with a stripped trailing 0 for EAN check-digit mismatches.
    async getProductById(id) {
        try {
            if (!id) return null;
            const targetId = String(id).trim();
            try { const p = await api.product(targetId); if (p && p.id) return p; } catch { /* try stripped */ }
            if (targetId.endsWith('0') && targetId.length > 5) {
                const stripped = targetId.slice(0, -1);
                try { const p = await api.product(stripped); if (p && p.id) return p; } catch { /* miss */ }
            }
            // Fallback 1: check /home-snapshot.json
            try {
                const snap = await this.getHomeSnapshot();
                const fromSnap = snap?.products?.find((p) => String(p.id || p.code) === targetId);
                if (fromSnap) return fromSnap;
            } catch { /* ignore */ }
            // Fallback 2: check /search-index.json (7,920+ products)
            try {
                const indexItems = await this.getSearchIndex();
                const fromIndex = indexItems?.find((p) => String(p.id || p.code) === targetId);
                if (fromIndex) return fromIndex;
            } catch { /* ignore */ }
            return null;
        } catch (error) { console.error('Error fetching product by ID:', error); throw error; }
    },

    async getAIReviewItems() {
        try {
            const r = await adminApi.aiReview();
            return { weights: r?.weights || [], translations: r?.translations || [], descriptions: r?.descriptions || [] };
        } catch (error) { console.error('Error fetching AI review items:', error); return { weights: [], translations: [], descriptions: [] }; }
    },

    // ---- Settings (Worker) -------------------------------------------------
    async getSettings(settingId) {
        try { return await api.settings(settingId); }
        catch (error) { console.error('Error fetching settings:', error); return null; }
    },

    async updateSettings(settingId, data) {
        try { await adminApi.setSetting(settingId, { ...data, updatedAt: new Date().toISOString() }); return true; }
        catch (error) { console.error('Error updating settings:', error); throw error; }
    },

    // Emulated realtime: initial fetch + 60s poll (the edge has no onSnapshot).
    onSettingsChange(settingId, callback) {
        let stopped = false;
        const tick = async () => { try { const d = await api.settings(settingId); if (!stopped && d) callback(d); } catch { /* keep polling */ } };
        tick();
        const iv = setInterval(tick, 60 * 1000);
        return () => { stopped = true; clearInterval(iv); };
    },

    async updateWonRate(newRate, userStr = 'System') {
        try {
            await adminApi.setSetting('currency', { wonRate: newRate, updatedAt: new Date().toISOString(), updatedBy: userStr });
            return true;
        } catch (error) { console.error('Error updating won rate:', error); throw error; }
    },

    // Server-side search via the edge Worker (FTS5 on D1).
    async searchServerSide(term) {
        try {
            if (!term || term.length < 2) return [];
            try { const r = await api.search(term); if (r && Array.isArray(r.products)) return r.products; } catch { /* fall through */ }
            const exact = await this.getProductById(term);
            return exact ? [exact] : [];
        } catch (error) { console.error('Server-side search failed:', error); return []; }
    },

    // Product re-sync is now driven by the Cloudflare-side ingestion pipeline (cron /
    // scripts), not a client-callable function. Surfaced as a clear error if invoked.
    async triggerProductSync() {
        throw new Error('Барааны sync нь backend pipeline (cron/scripts)-ээр ажилладаг.');
    },

    subscribeToSyncStatus() { return () => {}; },

    // Pre-built search index served from the CDN (cached in memory + Service Worker CacheStorage).
    async getSearchIndex() {
        if (_searchIndexData) return _searchIndexData;
        if (_searchIndexPromise) return _searchIndexPromise;
        const expand = (item) => ({
            id: item.id,
            name: item.n || '',
            name_mn: item.m || '',
            englishName: item.e || '',
            brand: item.b || '',
            code: item.c || item.id,
            image: item.i || '',
            price: item.p || 0,
            originalPrice: item.o || item.p || 0,
            hasDiscount: Boolean(item.d),
            status: item.s || 'active',
            categoryCode: item.cat || '',
            additionalCategories: item.ac || [],
            estimatedWarehousePrice: item.w || 0,
            estimatedMarkupKrw: item.mk || 0,
            weight: item.wt || item.weight || 0,
            ratingsAvg: item.r || 0,
            reviewCount: item.rc || 0,
            description: item.sm || '',
        });
        _searchIndexPromise = (async () => {
            try {
                const res = await fetch('/search-index.json', { cache: 'default' });
                if (res.ok) {
                    const data = await res.json();
                    if (data && Array.isArray(data.items) && data.items.length > 0) {
                        _searchIndexData = data.items.map(expand);
                        return _searchIndexData;
                    }
                }
            } catch { /* no index available */ } finally {
                _searchIndexPromise = null;
            }
            return null;
        })();
        return _searchIndexPromise;
    },
};
