import { db, uploadFileToStorage, callFunction } from '../firebase';
import { collection, addDoc, getDocs, query, orderBy, limit, startAfter, doc, getDoc, where, onSnapshot, documentId, updateDoc, deleteDoc, setDoc, getCountFromServer } from 'firebase/firestore';
import { withRetry } from '../utils/async';

const COLLECTION_NAME = 'products';

export const productService = {
    // Add a new product
    async addProduct(productData, imageFile, videoFile) {
        try {
            let imageUrl = productData.image;
            let videoUrl = productData.video;

            // Upload Image if it's a File object (blob)
            // Note: The UI currently sets image as a blob URL. We need the actual File object if possible,
            // or we fetch the blob from the URL to upload.
            // For now, let's assume we handle the valid File object or Blob upload here.

            if (imageFile) {
                imageUrl = await uploadFileToStorage(`products/${Date.now()}_${imageFile.name}`, imageFile);
            }

            if (videoFile) {
                videoUrl = await uploadFileToStorage(`products/videos/${Date.now()}_${videoFile.name}`, videoFile);
            }

            // Clean up undefined/null values that Firestore dislikes
            const cleanData = Object.fromEntries(
                Object.entries({
                    ...productData,
                    image: imageUrl,
                    video: videoUrl,
                    createdAt: new Date().toISOString()
                }).filter(([, v]) => v !== undefined)
            );

            const docRef = await addDoc(collection(db, COLLECTION_NAME), cleanData);

            return { id: docRef.id, ...cleanData };
        } catch (error) {
            console.error("Error adding product: ", error);
            throw error;
        }
    },

    // Update existing product
    async updateProduct(id, productData, imageFile, videoFile) {
        try {
            // updateDoc and doc are imported at the top of the file

            let imageUrl = productData.image;
            let videoUrl = productData.video;

            if (imageFile) {
                imageUrl = await uploadFileToStorage(`products/${Date.now()}_${imageFile.name}`, imageFile);
            }

            if (videoFile) {
                videoUrl = await uploadFileToStorage(`products/videos/${Date.now()}_${videoFile.name}`, videoFile);
            }

            // Clean up undefined/null values
            const cleanData = Object.fromEntries(
                Object.entries({
                    ...productData,
                    image: imageUrl,
                    video: videoUrl,
                    updatedAt: new Date().toISOString()
                }).filter(([, v]) => v !== undefined)
            );

            const productRef = doc(db, COLLECTION_NAME, String(id));



            await updateDoc(productRef, cleanData);

            return { id, ...cleanData };
        } catch (error) {
            console.error("Error updating product: ", error);
            throw error;
        }
    },

    // Helper for fallback
    async getFallbackProducts() {
        console.warn("Attempting fallback to products_cache.json");
        try {
            const response = await fetch('/products_cache.json');
            if (response.ok) {
                const data = await response.json();
                data.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
                return { products: data, lastVisible: null };
            }
        } catch (e) {
            console.error("Fallback failed:", e);
        }
        return { products: [], lastVisible: null };
    },

    // 🚀 NEW: Fetch products from dedicated special category collections
    async getSpecialCategoryProducts(categoryType) {
        const collectionMap = {
            'Sale': 'products_sale',
            'New': 'products_new',
            'Kirkland': 'products_kirkland',
            'Featured': 'products_featured' // Featured = Buyer's Pick (formerly Trend)
        };

        const collectionName = collectionMap[categoryType];
        if (!collectionName) {
            console.error(`Unknown category type: ${categoryType}`);
            return [];
        }

        try {
            console.log(`Fetching from ${collectionName}...`);
            const snapshot = await getDocs(collection(db, collectionName));
            console.log(`Fetched ${snapshot.size} products from ${collectionName}`);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error(`Error fetching ${collectionName}:`, error);
            return [];
        }
    },

    // 🚀 NEW: Update product status across ALL collections
    async updateStatus(id, status) {
        try {
            // updateDoc, doc, getDoc are imported at the top of the file

            // 1. Update main products collection
            const productRef = doc(db, COLLECTION_NAME, id);
            await updateDoc(productRef, {
                status: status,
                updatedAt: new Date().toISOString()
            });
            console.log(`Updated status to ${status} in main collection for ${id}`);

            // 2. Update special collections if present
            const specialCollections = ['products_sale', 'products_new', 'products_kirkland', 'products_featured'];

            const updatePromises = specialCollections.map(async (colName) => {
                const docRef = doc(db, colName, id);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    await updateDoc(docRef, { status: status });
                    console.log(`Updated status in ${colName} for ${id}`);
                }
            });

            await Promise.all(updatePromises);
            return true;
        } catch (error) {
            console.error("Error updating status:", error);
            throw error;
        }
    },

    // 🚀 NEW: Permanently delete product from ALL collections
    async deleteProduct(id) {
        try {
            // deleteDoc, doc are imported at the top of the file

            // 1. Delete from main collection
            await deleteDoc(doc(db, COLLECTION_NAME, id));
            console.log(`Deleted product ${id} from main collection`);

            // 2. Delete from special collections
            const specialCollections = ['products_sale', 'products_new', 'products_kirkland', 'products_featured'];
            const deletePromises = specialCollections.map(colName =>
                deleteDoc(doc(db, colName, id)).catch(err => console.warn(`Failed to delete from ${colName}:`, err))
            );

            await Promise.all(deletePromises);
            return true;
        } catch (error) {
            console.error("Error deleting product:", error);
            throw error;
        }
    },

    // 🚀 NEW: Get all Inactive products for Admin
    async getInactiveProducts() {
        try {
            const q = query(
                collection(db, COLLECTION_NAME),
                where('status', '==', 'inactive')
            );
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error fetching inactive products:", error);
            return [];
        }
    },

    // 🚀 NEW: Get all Deleted products for Admin
    async getDeletedProducts() {
        try {
            const q = query(
                collection(db, COLLECTION_NAME),
                where('status', '==', 'deleted')
            );
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error fetching deleted products:", error);
            return [];
        }
    },

    // 🚀 Performance: Fetch pre-sorted products from dedicated home_products collection
    async getHomeProducts(limitCount = 0) {
        try {
            console.log(`Fetching pre-sorted products from home_products collection (limit: ${limitCount || 'all'})...`);
            let q = query(
                collection(db, 'home_products'),
                orderBy('sortOrder', 'asc')
            );

            if (limitCount > 0) {
                q = query(q, limit(limitCount));
            }

            const snapshot = await withRetry(() => getDocs(q));

            if (snapshot.empty) {
                console.warn("⚠️ home_products collection returned 0 docs. Forcing fallback to special products.");
                throw new Error("Empty_Home_Products_Snapshot");
            }

            // Filter out metadata if it somehow gets into the list (though select/doc ID usually prevents it)
            return snapshot.docs
                .filter(doc => doc.id !== '__metadata__' && doc.id !== 'sync_info')
                .map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        ...data,
                        price: data.price || data.priceKRW || 0,
                        originalPrice: data.originalPrice || data.originalPriceKRW || 0
                    };
                });

        } catch (error) {
            console.error("Error fetching home products:", error);
            // Fallback to the multi-tag query if home_products fails or is empty
            return this.getAllSpecialProducts(40);
        }
    },

    // 🚀 Fetch the STATIC home snapshot served from Firebase Hosting's CDN
    // (generated by scripts/core/build-home-snapshot.js). This is dramatically
    // faster than querying the US-region Firestore for first-time visitors in
    // Mongolia, because the CDN has edge nodes near them. Returns null if the
    // snapshot isn't available yet (the app then falls back to Firestore).
    async getHomeSnapshot() {
        try {
            const res = await fetch('/home-snapshot.json', { cache: 'default' });
            if (!res.ok) return null;
            const data = await res.json();
            if (!data || !Array.isArray(data.products) || data.products.length === 0) return null;
            return data; // { generatedAt, productCount, categoryCounts, products }
        } catch {
            return null;
        }
    },

    async getHomeSyncInfo() {
        try {
            const docRef = doc(db, 'home_products', 'sync_info');
            const docSnap = await getDoc(docRef);
            return docSnap.exists() ? docSnap.data() : null;
        } catch (error) {
            console.error("Error fetching home sync info:", error);
            return null;
        }
    },

    // 🚀 Fetch all special products from MAIN products collection (with status filter)
    // PERFORMANCE FIX: Limit per tag for fast initial load
    async getAllSpecialProducts(limitPerTag = 40) {
        try {
            console.log("Fetching active special products from main collection...");

            // Query products that have any of the special tags AND are active
            const specialTags = ['Sale', 'New', 'Kirkland Signature', 'Featured'];
            const productMap = new Map();

            // Fetch each tag separately to avoid compound index requirements
            for (const tag of specialTags) {
                const q = query(
                    collection(db, COLLECTION_NAME),
                    where('status', '==', 'active'),
                    where('additionalCategories', 'array-contains', tag),
                    limit(limitPerTag) // 🚀 PERFORMANCE: Limit per tag for fast initial load
                );
                const snapshot = await getDocs(q);

                snapshot.docs.forEach(doc => {
                    if (!productMap.has(doc.id)) {
                        productMap.set(doc.id, { id: doc.id, ...doc.data() });
                    }
                });
            }

            const results = Array.from(productMap.values());
            console.log(`Aggregated ${results.length} unique active special products.`);
            return results;

        } catch (error) {
            console.error("Error fetching all special products:", error);
            return [];
        }
    },

    // 🚀 Scalability: Paginated Fetching
    async getPaginatedProducts(lastDoc = null, pageSize = 40, filters = {}) {
        try {
            const { category, subCategory, tag } = filters;
            let constraints = [];

            // 1. Build Query Constraints
            const productsRef = collection(db, COLLECTION_NAME);

            // NOTE: inactive products are now SHOWN (greyed-out + non-orderable, sorted to
            // the end) rather than hidden, so we no longer filter status==active here.
            // 'deleted' products are excluded client-side in productStore (Firestore can't
            // combine an inequality/`in` on status with the tag/category filters + ordering).

            // 🚀 TAG FILTERING (Highest Priority)
            if (tag) {
                if (tag === 'New') {
                    // Check common variations
                    // Note: Firestore array-contains is limited to ONE value.
                    // We must rely on 'New' being the standardized tag, OR 'Шинэ'.
                    // For now, let's query 'New' as it's the primary system tag.
                    // If we need OR logic (New OR Шинэ), we can't do it in a single simple query easily without "in" (limited to 10).
                    // But array-contains-any allows up to 10 values!
                    constraints.push(where('additionalCategories', 'array-contains-any', ['New', 'Шинэ', 'New Item']));
                } else if (tag === 'Trend') {
                    // Trend often overlaps with Kirkland? No, Trend is its own tag.
                    // But if we want Kirkland to be in Trend:
                    constraints.push(where('additionalCategories', 'array-contains-any', ['Trend', 'Kirkland Signature', 'Kirkland']));
                } else if (tag === 'Kirkland') {
                    constraints.push(where('additionalCategories', 'array-contains-any', ['Kirkland Signature', 'Kirkland']));
                } else {
                    constraints.push(where('additionalCategories', 'array-contains', tag));
                }
            }
            // Category Logic (Only if no Tag?)
            // Actually, we usually want Tag OR Category. But if Tag is selected, it usually overrides Category in UI.
            // If we allow drilling down (Category > Tag), we need both.
            // But Firestore has index limits.
            // Let's allow strictly one or separate.
            else if (category === 'Sale') {
                constraints.push(where('hasDiscount', '==', true));
            } else if (category === 'Featured') {
                constraints.push(where('targetCode', '==', 'BuyersPick'));
            } else if (category === 'ks_all' || category === 'Kirkland-Signature') {
                constraints.push(where('targetCode', '==', 'ks_all'));
            } else if (category && !subCategory) {
                constraints.push(where('categoryPath', 'array-contains', category));
            }

            if (!tag && subCategory) {
                constraints.push(where('categoryPath', 'array-contains', subCategory));
            }

            // When filtering by category, we need to avoid complex composite indexes.
            // Only use hasDiscount ordering on the main page (no category filter).
            // For category pages, just order by updatedAt.

            console.log(`fetching products. Category: ${category}, Sub: ${subCategory}, LastDoc: ${lastDoc ? lastDoc.id : 'null'}`);

            if (!category && !subCategory) {
                // Main page: Fetch all active products, filtering by tags done client-side
                // Removed 'additionalCategories' constraint due to Firestore index requirements
                // Products with filter tags will be sorted/filtered in Home.jsx
            } else {
                // Category pages:
                // Currently failing due to missing composite index (category + updatedAt).
                // Temporarily disable explicit sorting to allow products to load (defaults to ID sort).
                // TODO: Re-enable sorting once indexes are fully deployed.
                // FIX: Explicitly order by documentId to ensure startAfter works reliably
                constraints.push(orderBy(documentId()));
            }

            // Limit
            // StartAfter comes last in 'query' but we need the cursor

            if (lastDoc) {
                constraints.push(startAfter(lastDoc));
            } else if (filters.offset) {
                // DISABLED: offset is not available in Firebase client SDK
                // Offset-based pagination was causing import errors
                // Use cursor-based pagination instead (startAfter)
                console.warn('Offset pagination attempted but not supported. Please use cursor-based pagination.');
            }

            constraints.push(limit(pageSize));

            const q = query(productsRef, ...constraints);

            const snapshot = await withRetry(() => getDocs(q));

            if (snapshot.empty && !lastDoc) {
                // Only fallback if NO filters active? 
                // DISABLED: Fallback to static cache is confusing users.
                // if (!category && !subCategory) return this.getFallbackProducts();
                return { products: [], lastVisible: null };
            }

            const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const lastVisible = snapshot.docs[snapshot.docs.length - 1];

            return { products, lastVisible };
        } catch (error) {
            console.error("Error fetching products from Firestore:", error);
            // On permission error or any other error, try fallback
            // DISABLED: Fallback causing ghost items
            // if (!lastDoc && !filters.category) {
            //    return this.getFallbackProducts();
            // }
            throw error;
        }
    },

    // Get Total Count for current filter (for pagination UI)
    async getProductCount(filters = {}) {
        try {
            // getCountFromServer is imported at the top of the file
            const { category, subCategory, tag } = filters;
            let constraints = [];
            const productsRef = collection(db, COLLECTION_NAME);

            // Only count active products
            constraints.push(where('status', '==', 'active'));

            if (tag) {
                if (tag === 'New') {
                    constraints.push(where('additionalCategories', 'array-contains-any', ['New', 'Шинэ', 'New Item']));
                } else if (tag === 'Kirkland') {
                    constraints.push(where('additionalCategories', 'array-contains-any', ['Kirkland Signature', 'Kirkland']));
                } else {
                    constraints.push(where('additionalCategories', 'array-contains', tag));
                }
            } else if (category === 'Sale') {
                constraints.push(where('hasDiscount', '==', true));
            } else if (category && !subCategory) {
                constraints.push(where('categoryPath', 'array-contains', category));
            }

            if (subCategory) {
                constraints.push(where('categoryPath', 'array-contains', subCategory));
            }

            const q = query(productsRef, ...constraints);
            const snapshot = await getCountFromServer(q);
            return snapshot.data().count;
        } catch (error) {
            console.error("Error fetching count:", error);
            return 0;
        }
    },

    // 🚀 Get counts for all categories at once.
    // These power the category-menu badges and change only when the catalog is
    // re-synced, so we cache them in localStorage (30 min). Without the cache this
    // fired ~15 separate getCountFromServer round-trips on EVERY home load — the
    // single biggest source of perceived slowness for users far from the DB region.
    async getAllCategoryCounts() {
        const CACHE_KEY = 'costco_category_counts_v3';
        const TTL_MS = 30 * 60 * 1000;
        try {
            const raw = typeof localStorage !== 'undefined' && localStorage.getItem(CACHE_KEY);
            if (raw) {
                const cached = JSON.parse(raw);
                if (cached && cached.t && (Date.now() - cached.t) < TTL_MS && cached.counts) {
                    return cached.counts; // instant — no network
                }
            }
        } catch { /* ignore cache read errors */ }

        try {
            // getCountFromServer is imported at the top of the file
            const productsRef = collection(db, COLLECTION_NAME);

            // To be truly efficient and avoid 30+ separate network requests, 
            // we could fetch all active product metadata and aggregate.
            // But since we want "real-time" count from server:
            // For now, we'll fetch them individually but in parallel.

            const categoriesSnapshot = await getDocs(collection(db, 'categories'));
            const categoryIds = categoriesSnapshot.docs.map(doc => doc.id);

            const countPromises = categoryIds.map(async (catId) => {
                const q = query(productsRef,
                    where('status', '==', 'active'),
                    where('categoryPath', 'array-contains', catId)
                );
                const countSnap = await getCountFromServer(q);
                return { id: catId, count: countSnap.data().count };
            });

            // Add special categories - Use additionalCategories to count products that may belong to multiple categories
            const specialTags = ['Sale', 'New', 'Kirkland', 'Featured'];
            const specialPromises = specialTags.map(async (tag) => {
                let q;
                // Use additionalCategories which contains all category tags a product belongs to
                if (tag === 'Sale') {
                    // Products in Sale have 'Sale' or 'Хямдралтай' in additionalCategories
                    q = query(productsRef, where('status', '==', 'active'), where('additionalCategories', 'array-contains', 'Sale'));
                } else if (tag === 'New') {
                    q = query(productsRef, where('status', '==', 'active'), where('additionalCategories', 'array-contains', 'New'));
                } else if (tag === 'Kirkland') {
                    q = query(productsRef, where('status', '==', 'active'), where('additionalCategories', 'array-contains', 'Kirkland Signature'));
                } else { // Featured
                    q = query(productsRef, where('status', '==', 'active'), where('additionalCategories', 'array-contains', 'Featured'));
                }
                const countSnap = await getCountFromServer(q);
                return { id: tag, count: countSnap.data().count };
            });

            const results = await Promise.all([...countPromises, ...specialPromises]);
            const countMap = {};
            results.forEach(r => countMap[r.id] = r.count);
            try {
                localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), counts: countMap }));
            } catch { /* ignore quota errors */ }
            return countMap;
        } catch (error) {
            console.error("Error fetching all category counts:", error);
            return {};
        }
    },

    // Fetch single product by ID (Doc ID or productId field)
    async getProductById(id) {
        try {
            const findExact = async (targetId) => {
                // 1. Try by Doc ID
                const docRef = doc(db, COLLECTION_NAME, targetId);
                const docSnap = await withRetry(() => getDoc(docRef));

                if (docSnap.exists()) {
                    return { id: docSnap.id, ...docSnap.data() };
                }

                // 2. Try by 'productId' field (numeric or string)
                const productsRef = collection(db, COLLECTION_NAME);

                // Try string match
                let q = query(productsRef, where("productId", "==", targetId), limit(1));
                let snapshot = await getDocs(q);

                if (snapshot.empty && !isNaN(targetId)) {
                    // Try number match
                    q = query(productsRef, where("productId", "==", Number(targetId)), limit(1));
                    snapshot = await getDocs(q);
                }

                if (!snapshot.empty) {
                    const doc = snapshot.docs[0];
                    return { id: doc.id, ...doc.data() };
                }
                return null;
            };

            // First Attempt: Exact Match
            let result = await findExact(id);
            if (result) return result;

            // Second Attempt: If ends with '0', try stripping it (EAN-13 padding / Check digit issue)
            if (typeof id === 'string' && id.endsWith('0') && id.length > 5) {
                const stripped = id.slice(0, -1);
                console.log(`Initial lookup failed for ${id}, trying stripped: ${stripped}`);
                result = await findExact(stripped);
                if (result) return result;
            }

            return null;
        } catch (error) {
            console.error("Error fetching product by ID:", error);
            throw error;
        }
    },

    // 🚀 NEW: Get AI Review Items
    async getAIReviewItems() {
        try {
            const productsRef = collection(db, COLLECTION_NAME);

            // We need 3 separate queries because OR queries are limited/complex in Firestore
            const [weights, translations, descriptions] = await Promise.all([
                getDocs(query(productsRef, where('aiWeightStatus', '==', 'unfixable'))),
                getDocs(query(productsRef, where('translationStatus', '==', 'manual_required'))),
                getDocs(query(productsRef, where('aiDescriptionStatus', '==', 'failed')))
            ]);

            return {
                weights: weights.docs.map(doc => ({ id: doc.id, ...doc.data() })),
                translations: translations.docs.map(doc => ({ id: doc.id, ...doc.data() })),
                descriptions: descriptions.docs.map(doc => ({ id: doc.id, ...doc.data() }))
            };
        } catch (error) {
            console.error("Error fetching AI review items:", error);
            return { weights: [], translations: [], descriptions: [] };
        }
    },

    // Global Settings Management
    async getSettings(settingId) {
        try {
            const docRef = doc(db, 'settings', settingId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                return docSnap.data();
            }
            return null;
        } catch (error) {
            console.error("Error fetching settings:", error);
            return null;
        }
    },

    async updateSettings(settingId, data) {
        try {
            // setDoc, doc are imported at the top of the file
            const docRef = doc(db, 'settings', settingId);
            await setDoc(docRef, {
                ...data,
                updatedAt: new Date().toISOString()
            }, { merge: true });
            return true;
        } catch (error) {
            console.error("Error updating settings:", error);
            throw error;
        }
    },

    onSettingsChange(settingId, callback) {
        const docRef = doc(db, 'settings', settingId);
        return onSnapshot(docRef, (snapshot) => {
            if (snapshot.exists()) {
                callback(snapshot.data());
            }
        }, (error) => {
            console.error(`Error listening to ${settingId} changes:`, error);
        });
    },

    // Specific Rate Update with History
    async updateWonRate(newRate, userStr = 'System') {
        try {
            // setDoc, addDoc, collection, doc are imported at the top of the file

            // 1. Update current rate
            const docRef = doc(db, 'settings', 'currency');
            await setDoc(docRef, {
                wonRate: newRate,
                updatedAt: new Date().toISOString(),
                updatedBy: userStr
            }, { merge: true });

            // 2. Add to History
            const historyRef = collection(db, 'settings', 'currency', 'history');
            await addDoc(historyRef, {
                rate: newRate,
                date: new Date().toISOString(),
                user: userStr
            });

            return true;
        } catch (error) {
            console.error("Error updating won rate:", error);
            throw error;
        }
    },

    // 🔍 Server-Side Search Fallback
    // Used when client-side index is unavailable (e.g., timeout, DB contention)
    async searchServerSide(term) {
        try {
            if (!term || term.length < 2) return [];

            console.log("🔍 Server-side search for:", term);

            // Strategy 1: Try exact ID match first (fast, indexed)
            const exactMatch = await this.getProductById(term);
            if (exactMatch) {
                return [exactMatch];
            }

            // Strategy 2: Search code field (fast, indexed)
            // Note: This requires an index on 'code'
            const qCode = query(
                collection(db, COLLECTION_NAME),
                where('code', '==', term),
                where('status', '==', 'active'),
                limit(5)
            );
            const snapCode = await getDocs(qCode);
            if (!snapCode.empty) {
                return snapCode.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }

            // Strategy 3: Search by name (StartsWith - case sensitive in Firestore!)
            // Firestore doesn't support generic fuzzy search.
            // We rely on 'searchKeywords' array if we implemented it, or just basic prefix match.
            // For now, let's just return nothing and rely on client index.
            // Or try a basic 'name' >= term && 'name' <= term + '\uf8ff'
            const termCap = term.charAt(0).toUpperCase() + term.slice(1);
            const qName = query(
                collection(db, COLLECTION_NAME),
                where('name', '>=', termCap),
                where('name', '<=', termCap + '\uf8ff'),
                where('status', '==', 'active'),
                limit(20)
            );
            const snapName = await getDocs(qName);

            return snapName.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        } catch (error) {
            console.error("Server-side search failed:", error);
            return [];
        }
    },

    // 🚀 NEW: Trigger Cloud Function for Product Sync
    async triggerProductSync() {
        try {
            // Functions SDK is lazily loaded by callFunction (see firebase.js)
            await callFunction('syncProducts', undefined, { timeout: 540000 }); // 9m timeout
            return true;
        } catch (error) {
            console.error("Sync trigger failed:", error);
            throw error;
        }
    },

    // 🚀 NEW: Listen to Sync Status
    subscribeToSyncStatus(callback) {
        // Uses top-level imports for onSnapshot and doc (already imported at file top)
        const docRef = doc(db, 'system', 'syncStatus');
        return onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                callback(docSnap.data());
            }
        });
    },

    // 🚀 NEW: Fetch pre-built search index from Firestore (chunked for large datasets)
    // This is much faster than fetching all products metadata
    async getSearchIndex() {
        // Shortened-key → full-shape expander (shared by both the CDN and Firestore paths).
        const expand = (item) => ({
            id: item.id,
            name: item.n,
            name_mn: item.m,
            englishName: item.e,
            brand: item.b,
            code: item.c,
            image: item.i,
            price: item.p,
            originalPrice: item.o,
            hasDiscount: item.d,
            status: item.s,
            categoryCode: item.cat,
            additionalCategories: item.ac,
            estimatedWarehousePrice: item.w || 0,
            estimatedMarkupKrw: item.mk || 0,
            description: item.sm || '',
        });

        // 1) STATIC index from the CDN — one request from a nearby edge, far faster
        //    (esp. from Mongolia) than pulling meta + N chunks from the US Firestore.
        try {
            const res = await fetch('/search-index.json', { cache: 'default' });
            if (res.ok) {
                const data = await res.json();
                if (data && Array.isArray(data.items) && data.items.length > 0) {
                    console.log(`✅ Search index loaded (CDN): ${data.items.length} items`);
                    return data.items.map(expand);
                }
            }
        } catch { /* fall through to Firestore */ }

        // 2) Fallback: Firestore metadata + chunks.
        try {
            console.log("🔍 Fetching search index (Firestore fallback)...");
            const metaDoc = await getDoc(doc(db, 'system', 'search_index_meta'));
            if (!metaDoc.exists()) {
                console.warn("⚠️ Search index metadata not found");
                return null;
            }
            const meta = metaDoc.data();
            const chunkPromises = [];
            for (let i = 0; i < meta.totalChunks; i++) {
                chunkPromises.push(getDoc(doc(db, 'system', `search_index_${i}`)));
            }
            const chunkDocs = await Promise.all(chunkPromises);
            const allItems = [];
            for (const chunkDoc of chunkDocs) {
                if (chunkDoc.exists()) allItems.push(...chunkDoc.data().items.map(expand));
            }
            console.log(`✅ Search index loaded (Firestore): ${allItems.length} items`);
            return allItems;
        } catch (error) {
            console.error("❌ Error fetching search index:", error);
            return null;
        }
    }
};
