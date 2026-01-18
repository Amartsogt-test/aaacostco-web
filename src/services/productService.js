import { db, storage } from '../firebase';
import { collection, addDoc, getDocs, query, orderBy, limit, startAfter, doc, getDoc, where, onSnapshot, documentId } from 'firebase/firestore';

import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

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
                const imageRef = ref(storage, `products/${Date.now()}_${imageFile.name}`);
                const snapshot = await uploadBytes(imageRef, imageFile);
                imageUrl = await getDownloadURL(snapshot.ref);
            }

            if (videoFile) {
                const videoRef = ref(storage, `products/videos/${Date.now()}_${videoFile.name}`);
                const snapshot = await uploadBytes(videoRef, videoFile);
                videoUrl = await getDownloadURL(snapshot.ref);
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
            // we need updateDoc from firestore
            const { updateDoc, doc } = await import('firebase/firestore');

            let imageUrl = productData.image;
            let videoUrl = productData.video;

            if (imageFile) {
                const imageRef = ref(storage, `products/${Date.now()}_${imageFile.name}`);
                const snapshot = await uploadBytes(imageRef, imageFile);
                imageUrl = await getDownloadURL(snapshot.ref);
            }

            if (videoFile) {
                const videoRef = ref(storage, `products/videos/${Date.now()}_${videoFile.name}`);
                const snapshot = await uploadBytes(videoRef, videoFile);
                videoUrl = await getDownloadURL(snapshot.ref);
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

    // Fetch recent products (limited)
    async getProducts(limitCount = 50) {
        const snapshot = await getDocs(query(
            collection(db, COLLECTION_NAME),
            orderBy('updatedAt', 'desc'),
            limit(limitCount)
        ));
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
            const { updateDoc, doc, getDoc } = await import('firebase/firestore');

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
            const { deleteDoc, doc } = await import('firebase/firestore');

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

    // 🚀 NEW: Permanently DELETE ALL records in 'Trash' (Bulk Action)
    async deleteAllDeletedProducts() {
        try {
            const deletedProducts = await this.getDeletedProducts();
            if (deletedProducts.length === 0) return 0;

            console.log(`Permanently deleting ${deletedProducts.length} items from trash...`);

            // Delete in parallel
            const deletePromises = deletedProducts.map(p => this.deleteProduct(p.id));
            await Promise.all(deletePromises);

            return deletedProducts.length;
        } catch (error) {
            console.error("Error emptying trash:", error);
            throw error;
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

            const snapshot = await getDocs(q);

            if (snapshot.empty) {
                console.warn("⚠️ home_products collection returned 0 docs. Forcing fallback to special products.");
                throw new Error("Empty_Home_Products_Snapshot");
            }

            // Filter out metadata if it somehow gets into the list (though select/doc ID usually prevents it)
            return snapshot.docs
                .filter(doc => doc.id !== '__metadata__')
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

    // 🚀 NEW: Fetch featured products from featured_products collection
    // limit: if provided, only fetch first N products (for fast initial load)
    async getFeaturedProducts(filterName = null, limit = null) {
        try {
            let allProductIds = [];

            if (filterName) {
                // Fetch specific filter
                const filterDoc = await getDoc(doc(db, 'featured_products', filterName));
                if (filterDoc.exists()) {
                    allProductIds = filterDoc.data().productIds || [];
                }
            } else {
                // Fetch all featured products (Sale, Trend, New, Kirkland)
                const featuredSnapshot = await getDocs(collection(db, 'featured_products'));
                featuredSnapshot.forEach(doc => {
                    const ids = doc.data().productIds || [];
                    allProductIds.push(...ids);
                });
                // Remove duplicates
                allProductIds = [...new Set(allProductIds)];
            }

            console.log(`Featured products: ${allProductIds.length} IDs loaded`);

            if (allProductIds.length === 0) {
                return { products: [], totalIds: 0, allIds: [] };
            }

            // Apply limit if provided (for progressive loading)
            const idsToFetch = limit ? allProductIds.slice(0, limit) : allProductIds;

            // Fetch product details in batches of 10 (Firestore 'in' limit)
            const products = [];
            for (let i = 0; i < idsToFetch.length; i += 10) {
                const batch = idsToFetch.slice(i, i + 10);
                const q = query(
                    collection(db, COLLECTION_NAME),
                    where('__name__', 'in', batch)
                );
                const snapshot = await getDocs(q);
                snapshot.forEach(doc => {
                    products.push({ id: doc.id, ...doc.data() });
                });
            }

            return {
                products,
                totalIds: allProductIds.length,
                allIds: allProductIds  // Return all IDs for background loading
            };
        } catch (error) {
            console.error("Error fetching featured products:", error);
            return { products: [], totalIds: 0, allIds: [] };
        }
    },

    // 🚀 Fetch products by IDs (for background loading)
    async getProductsByIds(ids) {
        try {
            const products = [];
            for (let i = 0; i < ids.length; i += 10) {
                const batch = ids.slice(i, i + 10);
                const q = query(
                    collection(db, COLLECTION_NAME),
                    where('__name__', 'in', batch)
                );
                const snapshot = await getDocs(q);
                snapshot.forEach(doc => {
                    products.push({ id: doc.id, ...doc.data() });
                });
            }
            return products;
        } catch (error) {
            console.error("Error fetching products by IDs:", error);
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

            // 🔒 ALWAYS filter by active status - inactive/deleted products should not be visible
            constraints.push(where('status', '==', 'active'));

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
            } else if (category) {
                constraints.push(where('category', '==', category));
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

            const snapshot = await getDocs(q);

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

    // 🔍 Client-Side Search Support
    // Fetch minimal metadata for ALL active products
    async getAllProductsMetadata() {
        try {
            const productsRef = collection(db, COLLECTION_NAME);
            // Removed orderBy to prevent errors with mixed types (String vs Timestamp)
            const q = query(productsRef);
            const snapshot = await getDocs(q);

            // Map to minimal data
            return snapshot.docs
                .map(doc => {
                    const d = doc.data();
                    // 🔒 Filter out deleted AND inactive products - they should not appear in search
                    if (d.status === 'deleted' || d.status === 'inactive') return null;
                    return {
                        id: doc.id,
                        name: d.name,
                        code: d.code, // Searchable code
                        englishName: d.englishName,
                        name_mn: d.name_mn,
                        name_en: d.name_en,
                        brand: d.brand,
                        categoryName: d.categoryName,
                        subCategoryName: d.subCategoryName,
                        price: d.price || d.priceKRW || 0,
                        basePrice: d.basePrice,
                        image: d.image, // Needed for card
                        additionalCategories: d.additionalCategories,
                        discount: d.discount,
                        oldPrice: d.oldPrice,
                        originalPrice: d.originalPrice || d.originalPriceKRW || 0,
                        stock: d.stock,
                        status: d.status,
                        updatedAt: d.updatedAt // Keep for sorting
                    };
                })
                .filter(p => p !== null)
                .sort((a, b) => {
                    // Handle both String and Firestore Timestamp, or null
                    const dateA = a.updatedAt?.toDate ? a.updatedAt.toDate() : new Date(a.updatedAt || 0);
                    const dateB = b.updatedAt?.toDate ? b.updatedAt.toDate() : new Date(b.updatedAt || 0);
                    return dateB - dateA;
                });

        } catch (error) {
            console.error("Error fetching all products metadata:", error);
            return [];
        }
    },

    // Get Total Count for current filter (for pagination UI)
    async getProductCount(filters = {}) {
        try {
            const { getCountFromServer } = await import('firebase/firestore');
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
            } else if (category) {
                constraints.push(where('category', '==', category));
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

    // 🚀 NEW: Get counts for all categories at once
    async getAllCategoryCounts() {
        try {
            const { getCountFromServer } = await import('firebase/firestore');
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
                    where('category', '==', catId)
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
                const docSnap = await getDoc(docRef);

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
            const { setDoc, doc } = await import('firebase/firestore');
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
            const { setDoc, addDoc, collection, doc } = await import('firebase/firestore');

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

            // Strategy 2: Prefix Search (Faster than full metadata fetch)
            // Note: This is case-sensitive! We can try Capitalized and Lowercase.
            const productsRef = collection(db, COLLECTION_NAME);

            // Cap at 20 for speed
            const q = query(
                productsRef,
                where('name', '>=', term),
                where('name', '<=', term + '\uf8ff'),
                limit(20)
            );
            const snapshot = await getDocs(q);

            if (!snapshot.empty) {
                return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }

            // Strategy 3: REMOVED.
            // We rely on the Client-Side Index (in productStore) for deep full-text search.
            // The Server-Side search should stay FAST (ID or Prefix only).

            return [];
        } catch (error) {
            console.error("Server-side search failed:", error);
            return [];
        }
    },

    // 🚀 NEW: Fetch pre-built search index from Firestore (chunked for large datasets)
    // This is much faster than fetching all products metadata
    async getSearchIndex() {
        try {
            console.log("🔍 Fetching pre-built search index...");

            // First, get metadata to know how many chunks we have
            const metaDoc = await getDoc(doc(db, 'system', 'search_index_meta'));

            if (!metaDoc.exists()) {
                console.warn("⚠️ Search index metadata not found, falling back to full fetch");
                return null;
            }

            const meta = metaDoc.data();
            console.log(`📦 Search index: ${meta.totalItems} items in ${meta.totalChunks} chunks`);

            // Fetch all chunks in parallel
            const chunkPromises = [];
            for (let i = 0; i < meta.totalChunks; i++) {
                chunkPromises.push(getDoc(doc(db, 'system', `search_index_${i}`)));
            }

            const chunkDocs = await Promise.all(chunkPromises);

            // Combine all items from chunks
            const allItems = [];
            for (const chunkDoc of chunkDocs) {
                if (chunkDoc.exists()) {
                    const chunkData = chunkDoc.data();
                    // Expand shortened keys back to full names
                    const expandedItems = chunkData.items.map(item => ({
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
                        additionalCategories: item.ac
                    }));
                    allItems.push(...expandedItems);
                }
            }

            console.log(`✅ Search index loaded: ${allItems.length} items`);
            return allItems;

        } catch (error) {
            console.error("❌ Error fetching search index:", error);
            return null;
        }
    }
};
