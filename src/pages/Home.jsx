import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { useParams, useLocation, useNavigationType, useSearchParams } from 'react-router-dom';
import ProductCard from '../components/ProductCard';
import HeroBanner from '../components/HeroBanner';
import { useProductStore } from '../store/productStore';
import { useChatStore } from '../store/chatStore';
import { cleanBarcode } from '../utils/productUtils';



export default function Home() {
    // Use products from the store
    const {
        products, isLoading,
        setFilters, totalCount, currentPage, changePage,
        currentTag, setTagFilter, resetSearch,
        searchTerm, isSearching, searchProducts, setSearchTerm
    } = useProductStore();
    const { isOpen: isChatOpen } = useChatStore();

    const [searchParams] = useSearchParams();
    const rawQuery = searchParams.get('q');
    const query = cleanBarcode(rawQuery);

    // Initialize search from URL query param
    useEffect(() => {
        if (query && query !== searchTerm) {
            setSearchTerm(query);
            searchProducts(query, { preservePage: false });
        }
    }, [query, setSearchTerm, searchProducts]);

    const { mainId, subId } = useParams();

    // Track previous search term to determine if we should preserve page
    // (Preserve if term hasn't changed, e.g. on mount/restore. Reset if user types new term.)
    const prevSearchTerm = useRef(searchTerm);

    useEffect(() => {
        const isTermChanged = searchTerm !== prevSearchTerm.current;
        prevSearchTerm.current = searchTerm;

        const timeoutId = setTimeout(() => {
            if (searchTerm.trim()) {
                // OPTIMIZATION: If we already have products and the term hasn't changed (restoration),
                // DO NOT re-search. This mimics "cache" behavior.
                if (!isTermChanged && products.length > 0 && isSearching) {
                    console.log('Skipping redundant search (restored state)');
                    return;
                }

                searchProducts(searchTerm, { preservePage: !isTermChanged });
            } else if (isSearching && isTermChanged) {
                resetSearch();
            }
        }, 300);
        return () => clearTimeout(timeoutId);
    }, [searchTerm, searchProducts, resetSearch, isSearching, products.length]);


    // FIX: Use Global Sort State to persist across navigation
    const { priceSort } = useProductStore();

    const [paginationRange, setPaginationRange] = useState(window.innerWidth < 640 ? 1 : 5);

    useEffect(() => {
        const handleResize = () => {
            setPaginationRange(window.innerWidth < 640 ? 1 : 5);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Progressive Loading: Show products incrementally (10 at a time)
    // loaderRef removed - not used

    // loaderRef observer removed - not used


    // TRIGGER BACKEND FILTERING whenever URL parameters change

    useEffect(() => {
        let category = mainId ? decodeURIComponent(mainId) : null;
        const subCategory = subId ? decodeURIComponent(subId) : null;

        // Map frontend slugs to DB category names (special pages only)
        if (category === 'SpecialPriceOffers') category = 'Sale';
        if (category === 'BuyersPick') category = 'Featured';

        // Delegate "Do I need to fetch or reset?" logic to the store's setFilters action
        // This ensures that valid state (products=[]) triggers a fetch even if category hasn't changed (e.g. reload)
        setFilters(category, subCategory);
    }, [mainId, subId, setFilters]);

    // availableTags computation removed - not used in current UI

    // Legacy/Priority constants for sorting if needed
    const BEST_SELLING_IDS = ['525848', '669657', '622945', '674514', '674724'];

    const getFilteredProducts = () => {
        // Show all products except deleted ones AND hidden ones (inactive)
        // User Request: "Hide from homepage, but keep in DB/Search"
        // Also Filter out products with price <= 0 (member-only or data error)
        let filtered = [...products].filter(p => {
            const parsePrice = (val) => {
                if (typeof val === 'number') return val;
                if (typeof val === 'string') {
                    return parseFloat(val.replace(/,/g, '')) || 0;
                }
                return 0;
            };

            const price = parsePrice(p.price);
            const priceKRW = parsePrice(p.priceKRW);
            const finalPrice = parsePrice(p.finalPrice);

            return (
                p.status !== 'deleted' &&
                p.status !== 'inactive' &&
                (searchTerm ? true : (price > 0 || priceKRW > 0 || finalPrice > 0))
            );
        });


        // 2. SORT 
        // If priceSort is NOT selected, we use the natural database order (sortOrder)
        if (priceSort) {
            filtered.sort((a, b) => {
                const parsePrice = (val) => {
                    if (typeof val === 'number') return val;
                    if (typeof val === 'string') {
                        return parseFloat(val.replace(/,/g, '')) || 0;
                    }
                    return 0;
                };

                const actualPriceA = a.finalPrice !== undefined ? a.finalPrice : (a.price || a.priceKRW || 0);
                const priceA = parsePrice(actualPriceA);

                const actualPriceB = b.finalPrice !== undefined ? b.finalPrice : (b.price || b.priceKRW || 0);
                const priceB = parsePrice(actualPriceB);

                if (priceSort === 'desc') {
                    return priceB - priceA;
                }
                return priceA - priceB;
            });
        }
        // else: Maintain original array order (fetched pre-sorted from DB)

        return filtered;
    };

    const filteredProducts = getFilteredProducts();

    // Dynamic Pagination: Use filtered count if client filters are active
    // This prevents showing 18 pages (900 items) when only 40 items are "On Sale"
    const isClientFilterActive = !!currentTag;
    const paginationBaseCount = isClientFilterActive ? filteredProducts.length : (totalCount || 0);
    const totalPages = Math.ceil(paginationBaseCount / 40);

    const location = useLocation();

    // Handle logic for "Exclusive" selection across Pages
    // Link logic for "Exclusive"
    useEffect(() => {
        if (location.state?.initialTag) {
            setTagFilter(location.state.initialTag);
            window.history.replaceState({}, document.title);
        }
    }, [location, setTagFilter]);





    // Load filters on mount
    const { filters, fetchFilters } = useProductStore();
    useEffect(() => {
        if (!filters || filters.length === 0) {
            fetchFilters();
        }
    }, [fetchFilters, filters]);

    // -- SCROLL RESTORATION FIX V3 --
    // Force MANUAL restoration for Home page to ensure our custom logic takes precedence
    const navType = useNavigationType();

    // Enable Manual Restoration on mount, revert to Auto on unmount
    useEffect(() => {
        if ('scrollRestoration' in window.history) {
            window.history.scrollRestoration = 'manual';
        }
        return () => {
            if ('scrollRestoration' in window.history) {
                window.history.scrollRestoration = 'auto';
            }
        };
    }, []);

    // 1. SCROLL TO TOP ON PAGINATION
    // Whenever currentPage changes, scroll to top
    useEffect(() => {
        // Only scroll if we are NOT navigating back (POP)
        // AND if the page actually changed (mount is technically a change 0->1, but we handle mount in restoration)
        if (navType !== 'POP') {
            window.scrollTo({ top: 0, behavior: 'instant' });
        }
    }, [currentPage, navType]);

    // 2. SAVE SCROLL POSITION (THROTTLED)
    // Saving on unmount is unreliable (scrollY might be 0 already).
    // Saving on scroll ensures we always have the last known position.
    useEffect(() => {
        const key = `scroll_pos_${location.pathname}`;
        // Create simple throttle/debounce
        let timeout;

        const handleScroll = () => {
            if (timeout) return;
            timeout = setTimeout(() => {
                // Only save if we are effectively on the page (not 0 unless top)
                // We accept 0 if user is actually at top.
                sessionStorage.setItem(key, window.scrollY.toString());
                timeout = null;
            }, 100);
        };

        window.addEventListener('scroll', handleScroll);
        return () => {
            window.removeEventListener('scroll', handleScroll);
            if (timeout) clearTimeout(timeout);
        };
    }, [location.pathname]);

    // Restore logic
    useLayoutEffect(() => {
        if (navType === 'POP' && !isLoading && filteredProducts.length > 0) {
            const key = `scroll_pos_${location.pathname}`;
            const savedPosition = sessionStorage.getItem(key);

            console.log('Attempting restore:', { savedPosition, isLoading, count: filteredProducts.length });

            if (savedPosition) {
                const y = parseInt(savedPosition, 10);
                window.scrollTo(0, y);

                // Retry in case of render delay
                setTimeout(() => window.scrollTo(0, y), 50);
                setTimeout(() => window.scrollTo(0, y), 200);
            }
        }
    }, [isLoading, filteredProducts.length, navType, location.pathname]);

    return (
        <div className="pb-4">
            {/* Hero Section / Banner */}
            {!mainId ? (
                <div className="mt-2">
                    <HeroBanner />
                </div>
            ) : (
                <div className="mt-2">
                    {/* User requested to replace Title with Banner */}
                    <HeroBanner settingId="home_banner" />
                </div>
            )}

            {/* Search/Filter moved to fixed SearchFilterBar */}


            <div>
                {filteredProducts.length === 0 ? (
                    isLoading ? (
                        <div className="text-center py-20 text-gray-500 flex flex-col items-center">
                            <p className="text-lg font-bold">Уншиж байна...</p>
                            <p className="text-sm">Түр хүлээнэ үү</p>
                        </div>
                    ) : (
                        <div className="text-center py-20 text-gray-500">
                            <p className="text-xl">Бүтээгдэхүүн олдсонгүй.</p>
                        </div>
                    )
                ) : (
                    /* PAGINATION & LOADING LOGIC */
                    (() => {
                        // Pagination should be active if we have enough items, REGARDLESS of route
                        const usePagination = (totalCount > 40 || filteredProducts.length > 40);

                        // For Category pages (e.g. /category/Electronics), the backend already paginates.
                        // But for Main Home Stream (!mainId) AND Search/Tags, we now have FULL data in memory.
                        // So we must slice.
                        const isClientPaginated = searchTerm.trim() || !!currentTag || !mainId;
                        const pageItems = (usePagination && isClientPaginated)
                            ? filteredProducts.slice((currentPage - 1) * 40, currentPage * 40)
                            : filteredProducts;

                        if (usePagination && pageItems.length === 0 && isLoading) {
                            return <div className="text-center py-20 text-gray-500 flex flex-col items-center"><p className="text-lg font-bold">Уншиж байна...</p><p className="text-sm">Түр хүлээнэ үү</p></div>;
                        }

                        return (
                            <>
                                <div className={`grid gap-2 ${isChatOpen
                                    ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4'
                                    : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
                                    }`}>
                                    {pageItems.map(product => (
                                        <ProductCard
                                            key={product.id}
                                            product={product}
                                            isFeatured={product.additionalCategories?.includes('Онцгой')}
                                        />
                                    ))}
                                </div>
                                {/* Incremental Loading Indicator */}
                                {isLoading && filteredProducts.length > 0 && (
                                    <div className="flex justify-center py-4 w-full">
                                        <div className="flex items-center gap-2 text-gray-500 text-sm">
                                            <div className="w-4 h-4 border-2 border-gray-300 border-t-costco-blue rounded-full animate-spin"></div>
                                            <span>Уншиж байна...</span>
                                        </div>
                                    </div>
                                )}
                            </>
                        );
                    })()
                )}

                {/* PAGINATION */}
                {filteredProducts.length > 0 && (totalCount > 0) && (
                    <div className="mt-8 flex flex-col items-center pb-10 gap-3">

                        {/* Total Count Display */}
                        <div className="text-sm text-gray-500">
                            Нийт <span className="font-bold text-gray-700">{paginationBaseCount}</span> бараа
                        </div>

                        {/* Pagination Controls */}
                        {totalPages > 1 && (
                            <div className="flex items-center gap-2 mt-2">
                                <button
                                    onClick={() => changePage(currentPage - 1)}
                                    disabled={currentPage === 1}
                                    className="h-10 w-10 flex items-center justify-center rounded-full border bg-white disabled:opacity-30 hover:bg-gray-100"
                                >
                                    &lt;
                                </button>

                                {[...Array(totalPages)].map((_, idx) => {
                                    const p = idx + 1;
                                    // Removed strict 'canGoTo' check. Any page is accessible now via offset.
                                    // const canGoTo = p === 1 || !!cursors[p]; 

                                    // Show 1, Last, and surrounding pages (increased range: +/- 5 for desktop, +/- 1 for mobile)
                                    // Logic: Always show 1..totalPages if small.
                                    // Else show [1] ... [current-range]..[current+range] ... [last]

                                    const range = paginationRange;
                                    const isNearCurrent = p >= currentPage - range && p <= currentPage + range;
                                    const isFirst = p === 1;
                                    const isLast = p === totalPages;

                                    if (isFirst || isLast || isNearCurrent) {
                                        const active = p === currentPage;
                                        return (
                                            <button
                                                key={p}
                                                onClick={() => changePage(p)}
                                                // disabled={!canGoTo} // ENABLED ALL
                                                className={`h-10 w-10 flex items-center justify-center rounded-full border text-sm font-bold transition
                                                    ${active ? 'bg-costco-blue text-white border-costco-blue' : 'bg-white text-gray-700 hover:bg-gray-50'}
                                                `}
                                            >
                                                {p}
                                            </button>
                                        );
                                    }
                                    // Ellipsis
                                    if (p === currentPage - range - 1 || p === currentPage + range + 1) {
                                        return <span key={p} className="text-gray-400">...</span>;
                                    }
                                    return null;
                                })}

                                <button
                                    onClick={() => changePage(currentPage + 1)}
                                    disabled={currentPage >= totalPages}
                                    className="h-10 w-10 flex items-center justify-center rounded-full border bg-white disabled:opacity-30 hover:bg-gray-100"
                                >
                                    &gt;
                                </button>
                            </div>
                        )}
                    </div>
                )
                }
            </div >
        </div >
    );
}

