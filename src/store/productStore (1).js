import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MENU_DATA } from '../data/menuData';
import buildInfo from '../buildInfo.json';

// PAGE SIZE
const PAGE_SIZE = 40;

// Cache configuration for instant home page loading
const HOME_CACHE_KEY = 'costco_home_products_v3'; // Changed key for cache version support
const CACHE_VERSION_KEY = 'costco_cache_version';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const SEARCH_INDEX_CACHE_KEY = 'costco_search_index_v2';
const SEARCH_INDEX_TTL_MS = 60 * 60 * 1000; // 1 hour for search index

// Check if cache version matches - if not, clear all caches
const checkCacheVersion = () => {
    try {
        const storedVersion = localStorage.getItem(CACHE_VERSION_KEY);
        if (storedVersion !== buildInfo.cacheVersion) {
            // Clear all product caches when version changes
            console.log('New app version detected, clearing cache...');
            localStorage.removeItem(HOME_CACHE_KEY);
            localStorage.removeItem(SEARCH_INDEX_CACHE_KEY); // FORCE CLEAR INDEX
            localStorage.removeItem('costco_home_products_v1'); // Old cache key
            localStorage.removeItem('costco_search_index_v1'); // Old index key
            localStorage.setItem(CACHE_VERSION_KEY, buildInfo.cacheVersion);
            return false; // Cache was cleared
        }
        return true; // Cache is valid
    } catch {
        return true;
    }
};

// Run version check on load
checkCacheVersion();

// Cache helper functions
const getHomeCache = () => {
    try {
        const cached = localStorage.getItem(HOME_CACHE_KEY);
        if (!cached) return null;
        const parsed = JSON.parse(cached);
        // Check if cache is still valid
        if (Date.now() - parsed.timestamp > CACHE_TTL_MS) {
            localStorage.removeItem(HOME_CACHE_KEY);
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
};

const setHomeCache = (products, categoryCounts) => {
    try {
        // Strip large fields to fit in localStorage (5MB limit)
        // Keep only essential fields for display
        const minimalProducts = products.map(p => ({
            id: p.id,
            name: p.name,
            name_mn: p.name_mn,
            price: p.price,
            originalPrice: p.originalPrice,
            image: p.image,
            hasDiscount: p.hasDiscount,
            discountPercent: p.discountPercent,
            status: p.status,
            stock: p.stock,
            additionalCategories: p.additionalCategories,
            categoryCode: p.categoryCode,
            weight: p.weight
        }));

        localStorage.setItem(HOME_CACHE_KEY, JSON.stringify({
            products: minimalProducts,
            categoryCounts,
            timestamp: Date.now()
        }));
    } catch (e) {
        // localStorage full or disabled, ignore
        console.warn('Cache save failed:', e.message);
    }
};

const getSearchIndexCache = () => {
    try {
        const cached = localStorage.getItem(SEARCH_INDEX_CACHE_KEY);
        if (!cached) return null;
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.timestamp > SEARCH_INDEX_TTL_MS) {
            localStorage.removeItem(SEARCH_INDEX_CACHE_KEY);
            return null;
        }
        return parsed.index;
    } catch {
        return null;
    }
};

const setSearchIndexCache = (index) => {
    try {
        localStorage.setItem(SEARCH_INDEX_CACHE_KEY, JSON.stringify({
            index,
            timestamp: Date.now()
        }));
    } catch (e) {
        console.warn('Search index cache save failed:', e.message);
    }
};


export const useProductStore = create(
    persist(
        (set, get) => ({
            // State
            products: [],
            categories: [],
            filters: [], // Dynamic filters from Firestore
            currentCategory: null,
            currentSubCategory: null,
            currentTag: null, // NEW: Server-side tag filter
            categoryCounts: {}, // NEW: Store for all category counts
            wonRate: null,
            isLoading: false,
            lastVisible: null,
            hasMore: true,
            totalCount: 0,
            currentPage: 1,
            cursors: {}, // Map page number to startAfter doc
            searchIndex: [], // Cache for client-side search
            isSearching: false,
            searchTerm: '',
            priceSort: null, // NEW: Persisted sort order ('asc', 'desc', null)

            // Actions
            fetchFilters: async () => {
                try {
                    const { db } = await import('../firebase');
                    const { getDocs, collection } = await import('firebase/firestore');

                    const querySnapshot = await getDocs(collection(db, 'filters'));
                    const filters = [];
                    querySnapshot.forEach((doc) => {
                        filters.push({ id: doc.id, ...doc.data() });
                    });
                    // Sort by order
                    filters.sort((a, b) => (a.order || 99) - (b.order || 99));
                    set({ filters });
                } catch (error) {
                    console.error("Error fetching filters:", error);
                }
            },

            fetchCategories: async () => {
                try {
                    const { db } = await import('../firebase');
                    const { getDocs, collection } = await import('firebase/firestore');

                    const querySnapshot = await getDocs(collection(db, 'categories'));
                    const cats = [];
                    querySnapshot.forEach((doc) => {
                        const data = doc.data();

                        // Find matching static info (for Icon, Banner, etc.)
                        const staticInfo = MENU_DATA.find(m => m.code === doc.id);

                        cats.push({
                            id: doc.id,
                            ...data,
                            banner: data.banner || staticInfo?.banner || null,
                        });
                    });

                    // Sort by ID naturally (cos_1, cos_2...)
                    cats.sort((a, b) => {
                        const numA = parseInt(a.id.replace('cos_', '')) || 999;
                        const numB = parseInt(b.id.replace('cos_', '')) || 999;
                        return numA - numB;
                    });

                    set({ categories: cats });

                    // 🚀 NEW: Fetch counts in background and merge
                    const { productService } = await import('../services/productService');
                    const counts = await productService.getAllCategoryCounts();

                    const catsWithCounts = cats.map(c => ({
                        ...c,
                        count: counts[c.id] || 0
                    }));

                    set({ categories: catsWithCounts, categoryCounts: counts });

                    // Update home cache with new counts (for instant filter count display)
                    const existingCache = getHomeCache();
                    if (existingCache) {
                        setHomeCache(existingCache.products, counts);
                    }
                } catch (error) {
                    console.error("Error fetching categories:", error);
                }
            },

            setFilters: (category, subCategory) => {
                const current = get();
                if (current.currentCategory === category && current.currentSubCategory === subCategory) {
                    // Already in this category context, don't reset unless empty
                    if (current.products.length === 0) {
                        get().fetchProducts(current.currentPage || 1);
                    }
                    return;
                }

                set({
                    currentCategory: category,
                    currentSubCategory: subCategory,
                    currentTag: null,
                    searchTerm: '', // Clear search when category changes
                    products: [],
                    lastVisible: null,
                    hasMore: true,
                    isLoading: false,
                    currentPage: 1,
                    cursors: {},
                    totalCount: 0
                });
                get().fetchProducts(1); // Auto-fetch page 1
            },

            fetchProducts: async (page = 1) => {
                const { currentTag, cursors } = get();
                const currentCategory = get().currentCategory;
                const currentSubCategory = get().currentSubCategory;

                set({ isLoading: true, currentPage: page });

                try {
                    const { productService } = await import('../services/productService');

                    if (page === 1) {
                        get().subscribeToWonRate();
                    }

                    if (get().isSearching) return;

                    // 1. 'Sale' Category - Special handling REMOVED to use Server Side Pagination
                    // Standard getPaginatedProducts handles 'Sale' (hasDiscount == true) efficiently.

                    // 🚀 NEW: Default Home Page Logic with CACHE-FIRST strategy
                    // If no category selected, fetch ALL special products (Sale + New + Kirkland + Featured)
                    if (!currentCategory && !currentSubCategory && !currentTag) {
                        // Optimization: If products already loaded (full list), just return
                        if (get().products.length > 0 && page > 1) {
                            set({ isLoading: false, currentPage: page });
                            return;
                        }

                        // STEP 1: Try to load from cache IMMEDIATELY (instant UI)
                        if (page === 1) {
                            const cached = getHomeCache();
                            if (cached && cached.products && cached.products.length > 0) {
                                // Show cached data instantly
                                // Removed slice to allow Global Sort in Home.jsx
                                const endIndex = PAGE_SIZE;
                                // const pageItems = cached.products.slice(startIndex, endIndex);

                                set({
                                    products: cached.products, // Send FULL list

                                    totalCount: cached.products.length,
                                    hasMore: endIndex < cached.products.length,
                                    isLoading: false,
                                    // currentPage: page, // Keep the page we requested
                                    categoryCounts: cached.categoryCounts || get().categoryCounts
                                });

                                // STEP 2: Fetch fresh data in BACKGROUND (don't block UI)
                                productService.getHomeProducts().then(freshProducts => {
                                    if (freshProducts && freshProducts.length > 0) {
                                        // Update cache
                                        setHomeCache(freshProducts, get().categoryCounts);

                                        // Only update UI if data changed significantly
                                        if (freshProducts.length !== cached.products.length ||
                                            freshProducts[0]?.id !== cached.products[0]?.id) {
                                            // const freshPageItems = freshProducts.slice(0, PAGE_SIZE);
                                            set({
                                                products: freshProducts, // Send FULL list

                                                totalCount: freshProducts.length,
                                                hasMore: PAGE_SIZE < freshProducts.length
                                            });
                                        }
                                    }
                                }).catch(err => console.error('Background refresh failed:', err));

                                return; // Exit early - we showed cached data
                            }
                        }

                        // STEP 3: No cache available - fetch TIRED (Fast first, then full)
                        console.log("🚀 Initial visit - starting tiered fetch...");

                        // 3.1 Fetch Fast Path (metadata + first 50 items)
                        const [syncInfo, fastProducts] = await Promise.all([
                            productService.getHomeSyncInfo(),
                            productService.getHomeProducts(50)
                        ]);

                        if (fastProducts && fastProducts.length > 0) {
                            set({
                                products: fastProducts,
                                totalCount: syncInfo?.totalProducts || fastProducts.length,
                                hasMore: true,
                                isLoading: false,
                                categoryCounts: get().categoryCounts
                            });

                            // 3.2 Fetch Full Path in background
                            productService.getHomeProducts().then(fullProducts => {
                                if (fullProducts && fullProducts.length > 0) {
                                    setHomeCache(fullProducts, get().categoryCounts);
                                    set({
                                        products: fullProducts,
                                        totalCount: fullProducts.length,
                                        hasMore: PAGE_SIZE < fullProducts.length
                                    });
                                }
                            }).catch(err => console.error("Full background fetch failed:", err));

                            return;
                        }

                        // Fallback if fast fetch failed for some reason
                        let allSpecialProducts = await productService.getHomeProducts();

                        // Save to cache for next time
                        if (allSpecialProducts.length > 0) {
                            setHomeCache(allSpecialProducts, get().categoryCounts);
                        }

                        set({ totalCount: allSpecialProducts.length });

                        // Client-side pagination for Home Stream
                        // WE DO NOT SLICE HERE anymore. We send ALL products to Home.jsx
                        // so it can perform GLOBAL SORT before slicing.
                        // const startIndex = (page - 1) * PAGE_SIZE;
                        // const endIndex = startIndex + PAGE_SIZE;
                        // const pageItems = allSpecialProducts.slice(startIndex, endIndex);

                        set({
                            products: allSpecialProducts, // Send FULL list
                            hasMore: page * PAGE_SIZE < allSpecialProducts.length,
                            isLoading: false,
                            currentPage: page
                        });
                        return; // Exit, avoiding the standard getPaginatedProducts call
                    }

                    // ... Standard Logic for Categories ...

                    // 2. Page 1 Count for Categories
                    if (page === 1 && (currentCategory || currentSubCategory)) {
                        productService.getProductCount({
                            category: currentCategory,
                            subCategory: currentSubCategory
                        }).then(count => {
                            set({ totalCount: count });
                        });
                    }

                    // 3. Cursor Logic
                    let cursor = page === 1 ? null : cursors[page];

                    if (!cursor && page > 1) {
                        let highestCachedPage = 1;
                        for (let p = page - 1; p >= 1; p--) {
                            if (cursors[p]) {
                                highestCachedPage = p;
                                break;
                            }
                        }

                        let currentCursor = cursors[highestCachedPage] || null;
                        for (let p = highestCachedPage; p < page; p++) {
                            const tempResult = await productService.getPaginatedProducts(currentCursor, PAGE_SIZE, {
                                category: currentCategory,
                                subCategory: currentSubCategory,
                                tag: currentTag
                            });

                            if (tempResult.lastVisible) {
                                currentCursor = tempResult.lastVisible;
                                const newCursorsTemp = { ...get().cursors };
                                newCursorsTemp[p + 1] = currentCursor;
                                set({ cursors: newCursorsTemp });
                            } else {
                                break;
                            }
                        }
                        cursor = currentCursor;
                    }

                    // 4. Fetch Products (Standard)
                    const result = await productService.getPaginatedProducts(cursor, PAGE_SIZE, {
                        category: currentCategory,
                        subCategory: currentSubCategory,
                        tag: currentTag
                    });

                    const nextCursor = result.lastVisible;
                    const newCursors = { ...get().cursors };

                    if (nextCursor) {
                        newCursors[page + 1] = nextCursor;
                    }

                    const mergedProducts = result.products;

                    const sortedProducts = mergedProducts.map(p => {
                        if (p.stock === 'outOfStock' && p.status !== 'inactive') {
                            return { ...p, status: 'inactive' };
                        }
                        return p;
                    }).sort((a, b) => {
                        const aIsInactive = a.status === 'inactive' || a.stock === 'outOfStock';
                        const bIsInactive = b.status === 'inactive' || b.stock === 'outOfStock';
                        if (aIsInactive && !bIsInactive) return 1;
                        if (!aIsInactive && bIsInactive) return -1;

                        const aHasDiscount = a.hasDiscount;
                        const bHasDiscount = b.hasDiscount;
                        if (aHasDiscount && !bHasDiscount) return -1;
                        if (!aHasDiscount && bHasDiscount) return 1;

                        return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
                    });

                    set({
                        products: sortedProducts,
                        cursors: newCursors,
                        hasMore: result.products.length === PAGE_SIZE,
                        isLoading: false
                    });

                } catch (error) {
                    console.error("Failed to fetch products:", error);
                    set({ isLoading: false });
                }
            },

            changePage: (page) => {
                const { currentTag } = get();

                // If using special collection filter, just update page for client-side pagination
                if (currentTag) {
                    set({ currentPage: page });
                    return;
                }

                // Otherwise, fetch from backend
                get().fetchProducts(page);
            },

            setWonRate: (newRate, userStr = 'System') => {
                const oldRate = get().wonRate;

                import('../services/productService').then(({ productService }) => {
                    productService.updateWonRate(newRate, userStr)
                        .catch(err => console.error('❌ Failed to save rate:', err));
                });

                if (oldRate !== null && Math.abs(newRate - oldRate) < 0.001) return;
                set({ wonRate: newRate });
            },

            subscribeToWonRate: async () => {
                if (window.__wonRateUnsubscribe) return;

                const { productService } = await import('../services/productService');

                try {
                    const currencySettings = await productService.getSettings('currency');
                    if (currencySettings && currencySettings.wonRate) {
                        const newRate = currencySettings.wonRate;
                        const oldRate = get().wonRate;

                        if (oldRate === null || Math.abs(newRate - oldRate) >= 0.001) {
                            set({ wonRate: newRate });
                        }
                    }
                } catch (error) {
                    console.error('❌ Failed to fetch initial rate:', error);
                }

                window.__wonRateUnsubscribe = productService.onSettingsChange('currency', (data) => {
                    const rawRate = data?.wonRate;
                    if (!rawRate) return;

                    const newRate = parseFloat(rawRate);
                    if (isNaN(newRate) || newRate <= 0) return;

                    const oldRate = get().wonRate;
                    if (oldRate !== null && Math.abs(newRate - oldRate) < 0.001) return;

                    set({ wonRate: newRate });
                });
            },

            addProduct: (product) => set((state) => ({
                products: [{ ...product, id: Date.now(), isNew: true, rating: 0, reviews: 0 }, ...state.products]
            })),

            updateProduct: (id, updatedProduct) => set((state) => ({
                products: state.products.map((p) => (p.id === id ? { ...p, ...updatedProduct } : p))
            })),

            deleteProduct: (id) => set((state) => ({
                products: state.products.filter((p) => p.id !== id)
            })),

            setProductStatus: async (id, status) => {
                // For inactive/deleted: REMOVE from products array for instant UI update
                // Users expect the product to disappear immediately
                if (status === 'inactive' || status === 'deleted') {
                    set((state) => ({
                        products: state.products.filter((p) => p.id !== id)
                    }));
                } else {
                    set((state) => ({
                        products: state.products.map((p) => (p.id === id ? { ...p, status } : p))
                    }));
                }

                try {
                    const { productService } = await import('../services/productService');
                    await productService.updateStatus(id, status);
                } catch (error) {
                    console.error('Failed to update status:', error);
                    // On error, refetch to restore the product if needed
                    get().fetchProducts(get().currentPage);
                }
            },

            softDeleteProduct: (id) => set((state) => ({
                products: state.products.map((p) => (p.id === id ? { ...p, status: 'deleted' } : p))
            })),

            restoreProduct: (id) => set((state) => ({
                products: state.products.map((p) => (p.id === id ? { ...p, status: 'active' } : p))
            })),

            addCategory: (category) => set((state) => ({
                categories: [...state.categories, category]
            })),

            deleteCategory: (categoryId) => set((state) => ({
                categories: state.categories.filter((c) => c.id !== categoryId)
            })),

            addSubCategory: (categoryId, subCategory) => set((state) => ({
                categories: state.categories.map(c =>
                    c.id === categoryId
                        ? { ...c, subcategories: [...(c.subcategories || []), subCategory] }
                        : c
                )
            })),

            deleteSubCategory: (categoryId, subCategoryId) => set((state) => ({
                categories: state.categories.map(c =>
                    c.id === categoryId
                        ? { ...c, subcategories: c.subcategories.filter(sub => sub.id !== subCategoryId) }
                        : c
                )
            })),

            searchProducts: async (term, options = {}) => {
                if (!term) {
                    get().resetSearch();
                    return;
                }

                const { preservePage } = options;
                const lowerTerm = term.toLowerCase().trim();

                set({
                    isLoading: true,
                    isSearching: true,
                    // If preservePage is TRUE (e.g. restoring from back button), keep current page.
                    // Otherwise (user typing), reset to 1.
                    currentPage: preservePage ? get().currentPage : 1
                });

                const { productService } = await import('../services/productService');

                // 1. FAST PATH: Search in current products first (Instant UI)
                const currentProducts = get().products;
                const localMatch = currentProducts.filter(p => {
                    const check = (str) => typeof str === 'string' && str.toLowerCase().includes(lowerTerm);
                    return check(p.name) || check(p.name_mn) || (p.id && String(p.id).includes(lowerTerm));
                });

                // OPTIMIZATION: Show ANY local match immediately ("1 by 1" requested behavior)
                if (localMatch.length > 0) {
                    set({
                        products: localMatch,
                        totalCount: localMatch.length,
                        // Do NOT set isLoading: false yet!
                        // We want to show results BUT keep loading indicator if we are going to fetch more.
                        // Actually, if we have results, users prefer to see them "done".
                        // Let's set isLoading: true only if we plan to fetch more.
                        isLoading: true
                    });
                } else if (!preservePage) {
                    // Only clear products if we are STARTING a new search.
                    // If we are preserving page (restoring), keep old products until new ones arrive
                    // to prevent "flash of zero content".
                    set({ products: [] });
                }

                try {
                    // 2. DEEP SEARCH: Use full index (from cache or server)
                    let index = get().searchIndex;

                    // If not in state, try localStorage
                    if (!index || index.length === 0) {
                        index = getSearchIndexCache();
                        if (index) {
                            set({ searchIndex: index });
                        }
                    }

                    // 🚀 NEW: If still missing, try pre-built index from Firestore (FAST!)
                    if (!index || index.length === 0) {
                        try {
                            console.log("🔍 Trying pre-built search index from Firestore...");
                            const prebuiltIndex = await productService.getSearchIndex();

                            if (prebuiltIndex && prebuiltIndex.length > 0) {
                                index = prebuiltIndex;
                                set({ searchIndex: index });
                                setSearchIndexCache(index);
                                console.log(`✅ Pre-built index loaded: ${index.length} items`);
                            }
                        } catch (err) {
                            console.warn("Pre-built index fetch failed:", err);
                        }
                    }

                    // FALLBACK: If still no index, fetch all products metadata (SLOW)
                    if (!index || index.length === 0) {
                        try {
                            console.log("⚠️ No pre-built index, falling back to full metadata fetch...");
                            const fetchPromise = productService.getAllProductsMetadata();
                            const timeoutPromise = new Promise((_, reject) =>
                                setTimeout(() => reject(new Error("Index fetch timed out")), 3000)
                            );

                            index = await Promise.race([fetchPromise, timeoutPromise]);

                            set({ searchIndex: index });
                            setSearchIndexCache(index);
                        } catch (err) {
                            console.warn("Full index fetch failed/timed out, falling back to server-side search:", err);
                            index = null;
                        }
                    }

                    // If index is valid, perform client-side search
                    if (index && index.length > 0) {
                        const filtered = index.filter(p => {
                            const check = (str) => typeof str === 'string' && str.toLowerCase().includes(lowerTerm);
                            return check(p.name) ||
                                check(p.englishName) ||
                                check(p.name_mn) ||
                                check(p.name_en) ||
                                check(p.brand) ||
                                (p.additionalCategories && p.additionalCategories.some(c => check(c))) ||
                                check(p.categoryName) ||
                                check(p.subCategoryName) ||
                                check(p.description_mn) ||
                                check(p.description_en) ||
                                check(p.code) ||
                                (p.id && String(p.id).includes(lowerTerm));
                        });

                        const mappedResults = filtered.map(p => ({
                            ...p,
                            price: p.price || p.priceKRW || 0,
                            originalPrice: p.originalPrice || p.originalPriceKRW || p.basePrice || 0
                        }));

                        // MERGE with local results (avoid duplicates)
                        const currentIds = new Set(get().products.map(p => p.id));
                        const newItems = mappedResults.filter(p => !currentIds.has(p.id));

                        if (newItems.length > 0 || get().products.length === 0) {
                            set(state => ({
                                products: [...state.products, ...newItems],
                                totalCount: state.products.length + newItems.length,
                                isLoading: false
                            }));
                        } else {
                            set({ isLoading: false });
                        }
                        return;
                    }

                    // 3. FALLBACK: Direct Server-Side Search (if index failed)
                    console.log("⚠️ Index unavailable, attempting server-side search for:", term);
                    const serverResults = await productService.searchServerSide(term); // We need to add this to service

                    set({
                        products: serverResults,
                        totalCount: serverResults.length,
                        isLoading: false
                    });

                } catch (error) {
                    console.error("Search failed:", error);
                    set({ products: [], isLoading: false });
                }
            },

            setTagFilter: async (tag) => {
                set({
                    currentTag: tag,
                    currentCategory: null,
                    currentSubCategory: null,
                    isSearching: true,
                    isLoading: true,
                    products: [],
                    currentPage: 1
                });

                try {
                    const { productService } = await import('../services/productService');

                    // 🚀 NEW: Fetch from dedicated collection (fast!)
                    const products = await productService.getSpecialCategoryProducts(tag);

                    // For special collections, only filter deleted/inactive (not outOfStock)
                    // Costco's 'stock' field = online availability, not physical inventory
                    const filtered = products.filter(p =>
                        p.status !== 'deleted' &&
                        p.status !== 'inactive'
                    );

                    set({
                        products: filtered,
                        totalCount: filtered.length,
                        isLoading: false,
                        isSearching: false
                    });

                } catch (error) {
                    console.error("Tag Filter Failed:", error);
                    set({ isLoading: false, isSearching: false });
                }
            },

            filterByTags: async () => {
                const { resetSearch } = get();
                if (get().isSearching) resetSearch();
            },

            setSearchTerm: (term) => set({ searchTerm: term }),

            resetSearch: () => {
                set({ isSearching: false, searchTerm: '', products: [], currentTag: null });
                get().fetchProducts(1);
            },

            // SORT ACTION
            setPriceSort: (sort) => set({ priceSort: sort }),
        }),
        {
            name: 'shoppy-product-storage-v36',
            version: 36,
            partialize: (state) => ({
                categories: state.categories,
                filters: state.filters,
                wonRate: state.wonRate,
                // Persist navigation state to fix "Back" button resetting page
                currentPage: state.currentPage,
                currentCategory: state.currentCategory,
                currentSubCategory: state.currentSubCategory,
                currentTag: state.currentTag,
                // Persist search state
                searchTerm: state.searchTerm,
                isSearching: state.isSearching,
                // Persist Sort State
                priceSort: state.priceSort
            }),
            migrate: (persistedState, version) => {
                if (version < 36) {
                    return {
                        products: [],
                        categories: [],
                        filters: [],
                        isLoading: false,
                        lastVisible: null,
                        hasMore: true
                    };
                }
                return persistedState;
            }
        }
    )
);
