import { useState, useEffect, useLayoutEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import { useProductStore } from '../store/productStore';
import { ShoppingCart, ArrowLeft, Star, ShieldCheck, MessageCircle, Check, Heart, Minus, Plus } from 'lucide-react';
import { useUIStore } from '../store/uiStore';
import { useChatStore } from '../store/chatStore';
import { useSettingsStore } from '../store/settingsStore';
import { useWishlistStore } from '../store/wishlistStore';
import { getProductWeight, getPriceBreakdown } from '../utils/productUtils';

export default function ProductDetail() {
    const { id } = useParams();
    const products = useProductStore(state => state.products);
    const categories = useProductStore(state => state.categories);

    // Fix: Compare as strings to handle both numeric (manual) and string (scraped) IDs
    const storeProduct = products.find(p => String(p.id) === id);

    // Cart Selectors (Reactive)
    const groundItems = useCartStore(state => state.groundItems);
    const airItems = useCartStore(state => state.airItems);
    const removeFromGround = useCartStore(state => state.removeFromGround);
    const removeFromAir = useCartStore(state => state.removeFromAir);
    const addToGround = useCartStore(state => state.addToGround);
    const addToAir = useCartStore(state => state.addToAir);

    const { openWithProduct } = useChatStore();
    const navigate = useNavigate();
    const { settings } = useSettingsStore();
    const { isInWishlist, toggleWishlist } = useWishlistStore();

    // Option Translation Map
    const OPTION_TRANSLATIONS = {
        '선택 option': 'Сонгоно уу',
        '무향': 'Үнэргүй',
        '라벤더': 'Лаванда',
        '자몽': 'Грейпфрут',
        '선택': 'Сонгоно уу',
        '색상': 'Өнгө',
        '사이즈': 'Хэмжээ',
        // Add more common Korean option terms here
    };

    const translateOption = (text) => {
        if (!text) return text;
        // Exact match check
        if (OPTION_TRANSLATIONS[text]) return OPTION_TRANSLATIONS[text];

        // Partial match for "Select option" variations
        if (text.includes('선택')) return 'Сонгоно уу';

        return text;
    };

    const [fetchedProduct, setFetchedProduct] = useState(null);
    const [loading, setLoading] = useState(true);
    const [, setError] = useState(null); // error state unused but setter needed
    // isAdded state removed - not used
    const [selectedOptions, setSelectedOptions] = useState({}); // Track selected option values
    const [quantity, setQuantity] = useState(1); // Track quantity


    useLayoutEffect(() => {
        window.scrollTo(0, 0);
    }, [id]);

    useEffect(() => {
        if (window.location.hash === '#comments') {
            const element = document.getElementById('comments');
            if (element) {
                setTimeout(() => {
                    element.scrollIntoView({ behavior: 'smooth' });
                }, 100);
            }
        }
    }, [id]);

    useEffect(() => {
        // If product is in store, set loading false but CONTINUALLY fetch fresh data
        if (storeProduct) {
            setLoading(false);
        }

        // Always try to fetch fresh data (revalidation)
        if (id) {
            if (!storeProduct) setLoading(true);
            const loadProduct = async () => {
                try {
                    const { productService } = await import('../services/productService');
                    const data = await productService.getProductById(id);
                    if (data) {
                        setFetchedProduct(data);
                    } else {
                        setError(true);
                    }
                } catch (err) {
                    console.error(err);
                    setError(true);
                } finally {
                    setLoading(false);
                }
            };
            loadProduct();
        }
    }, [id, storeProduct]);

    const product = fetchedProduct || storeProduct;

    const { currency, showToast } = useUIStore();
    const { wonRate } = useProductStore();

    // Price Calculation Logic
    // Price Calculation Logic
    let displayPrice = 0;
    let displayOldPrice = null;
    let priceInKRW = 0;
    let warehousePriceKRW = 0; // 🏪 Warehouse price for shipping calculations

    if (product) {
        // Expiration Check Logic (New)
        const now = new Date();
        const discountEnd = product.discountEndDate ? new Date(product.discountEndDate) : null;
        const isExpired = discountEnd && discountEnd < now;

        priceInKRW = product.price || product.priceKRW || 0;
        let oldPriceInKRW = product.originalPrice || product.originalPriceKRW || product.oldPrice || product.baseOldPrice || 0;

        // REVERT if expired
        if (isExpired && oldPriceInKRW > 0) {
            priceInKRW = oldPriceInKRW;
            oldPriceInKRW = 0;
        }

        // 🏪 Warehouse price = estimatedWarehousePrice or online price
        warehousePriceKRW = product.estimatedWarehousePrice || priceInKRW;

        if (currency === 'MNT') {
            displayPrice = Math.round(priceInKRW * wonRate);
        } else {
            displayPrice = priceInKRW;
        }

        if (oldPriceInKRW && oldPriceInKRW > priceInKRW) {
            if (currency === 'MNT') {
                displayOldPrice = Math.round(oldPriceInKRW * wonRate);
            } else {
                displayOldPrice = oldPriceInKRW;
            }
        }
    }

    // handleAddToCart removed - functionality moved to inline shipping buttons



    const currencySymbol = currency === 'MNT' ? '₮' : '₩';

    // Gallery State
    const [selectedImage, setSelectedImage] = useState(null);

    // Reset selected image when ID changes (pattern for derived state)
    const [prevId, setPrevId] = useState(id);
    if (id !== prevId) {
        setPrevId(id);
        setSelectedImage(null);
    }

    const weightInfo = getProductWeight(product);

    if (loading) {
        return (
            <div className="container mx-auto px-4 py-20 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p>Уншиж байна...</p>
            </div>
        );
    }

    if (!product) {
        return (
            <div className="container mx-auto px-4 py-20 text-center">
                <h2 className="text-2xl font-bold">Бүтээгдэхүүн олдсонгүй</h2>
                <Link to="/" className="text-blue-600 hover:underline">Нүүр хуудас руу буцах</Link>
            </div>
        );
    }

    const isInactive = product.status === 'inactive' || product.stock === 'outOfStock';

    const handleProductInquiry = () => {
        openWithProduct(product);
        // Navigate to chat page on mobile devices (matching lg breakpoint)
        if (window.innerWidth < 1024) {
            navigate('/chat');
        }
    };

    return (
        <div className={`bg-white min-h-screen py-8 ${isInactive ? 'grayscale-[50%]' : ''}`}>
            <div className="container mx-auto px-4">
                <button onClick={() => navigate(-1)} className="inline-flex items-center text-gray-500 hover:text-costco-blue mb-6 cursor-pointer">
                    <ArrowLeft size={18} className="mr-1" />
                    Буцах
                </button>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                    {/* Image Gallery */}
                    <div className="flex flex-col gap-4">
                        <div className={`border rounded bg-white flex items-center justify-center h-[500px] overflow-hidden relative ${isInactive ? 'grayscale' : ''}`}>
                            <img
                                src={selectedImage || product.image}
                                alt={product.name}
                                className={`w-full h-full object-contain ${isInactive ? 'opacity-70' : ''}`}
                            />
                            {/* Out of Stock Overlay */}
                            {isInactive && (
                                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                                    <span className="bg-gray-800 text-white text-lg font-bold px-6 py-3 rounded-full">
                                        Дууссан
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Thumbnails */}
                        {product.images && product.images.length > 1 && (() => {
                            // Filter to get unique images (one per galleryIndex, prefer 'product' or 'zoom' format)
                            let uniqueImages = [];

                            if (typeof product.images[0] === 'object' && product.images[0].galleryIndex !== undefined) {
                                // New format with galleryIndex - filter to unique images
                                const seenIndexes = new Set();
                                const preferredFormats = ['product', 'zoom', 'superZoom'];

                                // First pass: find best format for each galleryIndex
                                for (const format of preferredFormats) {
                                    for (const img of product.images) {
                                        if (!seenIndexes.has(img.galleryIndex) && img.format === format && img.url) {
                                            uniqueImages.push(img.url);
                                            seenIndexes.add(img.galleryIndex);
                                        }
                                    }
                                }

                                // Fallback: if we missed any galleryIndex, add first image with that index
                                for (const img of product.images) {
                                    if (!seenIndexes.has(img.galleryIndex) && img.url) {
                                        uniqueImages.push(img.url);
                                        seenIndexes.add(img.galleryIndex);
                                    }
                                }
                            } else {
                                // Old format (string array) - deduplicate using Set
                                const urlList = product.images.map(img => {
                                    if (!img) return null;
                                    return typeof img === 'string' ? img : img.url;
                                }).filter(Boolean);
                                uniqueImages = [...new Set(urlList)];
                            }

                            if (uniqueImages.length <= 1) return null;

                            return (
                                <div className="flex gap-2 overflow-x-auto pb-2">
                                    {uniqueImages.map((imgUrl, index) => (
                                        <button
                                            key={index}
                                            onClick={() => setSelectedImage(imgUrl)}
                                            className={`w-20 h-20 border rounded p-1 flex-shrink-0 bg-white ${selectedImage === imgUrl ? 'border-costco-blue ring-1 ring-costco-blue' : 'border-gray-200 hover:border-gray-400'}`}
                                        >
                                            <img src={imgUrl} alt="" className="w-full h-full object-contain" />
                                        </button>
                                    ))}
                                </div>
                            );
                        })()}
                    </div>

                    {/* Info */}
                    <div>
                        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                            {(() => {
                                // Subcategory label fallback map
                                const SUBCATEGORY_LABELS = {
                                    'cos_11.2': 'Оффисын тавилга',
                                    'cos_3.2': 'Тоглоом',
                                    'cos_3.2.1': 'LEGO / Барилгын тоглоом',
                                    'cos_6.1': 'Эмэгтэй хувцас',
                                    'cos_6.2': 'Эрэгтэй хувцас',
                                    'cos_6.3': 'Хүүхэд хувцас',
                                    'cos_8.2': 'Үс / Бие арчилгаа',
                                    'cos_10.11': 'Ундаа',
                                    'cos_10.11.4': 'Шүүс',
                                    'cos_10.13': 'Хөргөөлсөн хоол',
                                    'cos_2.2': 'Ор хөнжил / Дэр',
                                    'cos_4.1': 'Аялал / Кемпинг',
                                    'cos_4.2': 'Фитнесс',
                                    'cos_13.1': 'Тасалбар',
                                    'cos_13.2': 'Бэлэг',
                                    'cos_14.2': 'Ахуйн цахилгаан',
                                    'cos_15.2': 'Интерьер',
                                };

                                const mainCat = categories?.find(c => c.id === product.category);
                                const mainLabel = product.categoryName || mainCat?.label || product.category;

                                let subLabel = product.subCategoryName;
                                if (!subLabel && mainCat && product.subCategory) {
                                    const findSub = (subs) => {
                                        for (const s of subs || []) {
                                            if ((s.id || s.code) === product.subCategory) return s;
                                            if (s.subcategories) {
                                                const found = findSub(s.subcategories);
                                                if (found) return found;
                                            }
                                        }
                                        return null;
                                    };
                                    const sub = findSub(mainCat.subcategories);
                                    if (sub) subLabel = sub.label;
                                }

                                // Fallback to our map if still not found
                                if (!subLabel && product.subCategory) {
                                    subLabel = SUBCATEGORY_LABELS[product.subCategory];
                                }

                                return (
                                    <>
                                        <Link to={`/category/${product.category}`} className="hover:text-costco-blue hover:underline">
                                            {mainLabel}
                                        </Link>
                                        {subLabel && (
                                            <>
                                                <span>&gt;</span>
                                                <span className="font-medium text-gray-700">{subLabel}</span>
                                            </>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                        <h1 className="text-3xl font-bold text-gray-900 mb-2">{product.name_mn || product.englishName || product.name}</h1>
                        {product.name_mn && product.englishName && (
                            <h2 className="text-lg text-gray-600 mb-2 font-medium">
                                {product.englishName}
                            </h2>
                        )}


                        <div className="flex items-center gap-4 mb-4">
                            <div className="flex items-center text-yellow-500">
                                <Star fill="currentColor" size={20} />
                                <span className="ml-1 font-bold text-lg">{product.rating || 0}</span>
                            </div>
                            <span className="text-gray-400">|</span>
                            <a
                                href={product.costcoUrl || product.productLink || `https://www.costco.co.kr/p/${product.productId || product.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#005DA3] underline cursor-pointer hover:text-blue-800"
                            >
                                {product.reviewCount || 0} сэтгэгдэл
                            </a>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 mb-6 border-b pb-6 text-sm">
                            <div className="flex items-center gap-1 text-gray-600 bg-gray-100 px-2 py-1 rounded">
                                <span className="font-semibold">Code:</span> {product.productId || product.id}
                            </div>

                            <div className="flex items-center gap-1 text-gray-600">
                                <ShieldCheck size={16} />
                                <span>Баталгаат чанар</span>
                            </div>

                            <div className="flex items-center gap-1 text-gray-500 text-xs text-wrap break-all max-w-md">
                                {(() => {
                                    // Build the Costco link - prefer costcoUrl, then fix relative url, then fallback
                                    let costcoLink = product.costcoUrl;
                                    if (!costcoLink && product.url) {
                                        // If url is relative, prepend domain
                                        costcoLink = product.url.startsWith('http')
                                            ? product.url
                                            : `https://www.costco.co.kr${product.url}`;
                                    }
                                    if (!costcoLink) {
                                        costcoLink = `https://www.costco.co.kr/p/${product.productId || product.id}`;
                                    }
                                    return (
                                        <a
                                            href={costcoLink}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[#005DA3] underline hover:text-blue-800 break-all"
                                        >
                                            {costcoLink}
                                        </a>
                                    );
                                })()}
                            </div>
                        </div>

                        <div className="mb-8 p-4 bg-gray-50 rounded-lg border border-gray-100">
                            {/* Price Section - Warehouse Price as Main */}
                            <div className="flex items-end gap-3 mb-2">
                                <div className="text-4xl font-bold text-costco-red tracking-tight">
                                    {/* Show warehouse price if available, else show online price */}
                                    {product.estimatedWarehousePrice
                                        ? (currency === 'MNT'
                                            ? Math.round(product.estimatedWarehousePrice * wonRate).toLocaleString()
                                            : product.estimatedWarehousePrice.toLocaleString())
                                        : displayPrice.toLocaleString()
                                    }{currencySymbol}
                                </div>

                                {/* New Badge */}
                                {product.additionalCategories?.includes('New') && !isInactive && (
                                    <span className="bg-red-600 text-white text-sm font-bold px-2 py-0.5 rounded shadow-sm uppercase tracking-wider mb-1">
                                        NEW
                                    </span>
                                )}

                                {displayOldPrice && (
                                    <div className="text-xl text-gray-400 line-through mb-1">
                                        {displayOldPrice.toLocaleString()}{currencySymbol}
                                    </div>
                                )}
                                {/* Discount Percentage - Only if hasDiscount */}
                                {displayOldPrice && displayOldPrice > displayPrice && (product.hasDiscount || product.discount) && (
                                    <span className="text-lg font-bold text-red-500 bg-red-100 px-2 py-1 rounded mb-1">
                                        -{Math.round((1 - displayPrice / displayOldPrice) * 100)}%
                                    </span>
                                )}
                            </div>

                            {/* Store Price Label */}
                            {product.estimatedWarehousePrice && (
                                <div className="mb-3 flex items-center gap-2">
                                    <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded uppercase">
                                        🏪 Дэлгүүрийн үнэ
                                    </span>
                                </div>
                            )}

                            {/* Online Price (Secondary) */}
                            {product.estimatedWarehousePrice && (
                                <div className="mb-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                                    <div className="flex items-center gap-2 text-sm">
                                        <span className="text-blue-600 font-medium">🌐 Онлайн:</span>
                                        <span className="font-bold text-gray-700">
                                            {displayPrice.toLocaleString()}{currencySymbol}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Note about availability */}
                            <div className="mb-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200 text-xs text-yellow-800">
                                <p className="font-medium mb-1">💡 Санамж:</p>
                                <ul className="list-disc list-inside space-y-1 text-yellow-700">
                                    <li>Дэлгүүрт байхгүй бол онлайнаар захиалах боломжтой.</li>
                                    <li>Үнэ өөрчлөгдөх боломжтой.</li>
                                </ul>
                            </div>

                            {/* Discount Date Info (Moved here) */}
                            {product.discountEndDate && (
                                <div className="mb-4 inline-flex items-center gap-2 text-sm text-costco-red font-medium bg-red-50 px-3 py-1 rounded-full">
                                    <span>⏰ Хямдрал дуусах:</span>
                                    <span>{new Date(product.discountEndDate).toLocaleDateString()}</span>
                                </div>
                            )}

                            {/* Options Selector (Moved here) */}
                            {product.options && product.options.map((option, idx) => (
                                <div key={idx} className="mb-4">
                                    <label className="text-sm font-bold text-gray-900 mb-2 block uppercase">{translateOption(option.name)}</label>
                                    <select
                                        value={selectedOptions[option.name] || ''}
                                        onChange={(e) => setSelectedOptions(prev => ({ ...prev, [option.name]: e.target.value }))}
                                        className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-costco-blue focus:border-costco-blue bg-white"
                                    >
                                        <option value="">Сонгоно уу</option>
                                        {option.values.map((val, vIdx) => (
                                            <option key={vIdx} value={val}>
                                                {translateOption(val)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            ))}

                            {/* Quantity Selector (New) */}
                            <div className="mb-6">
                                <label className="text-sm font-bold text-gray-900 mb-2 block uppercase">Тоо ширхэг</label>
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden bg-white h-12">
                                        <button
                                            onClick={() => setQuantity(q => Math.max(1, q - 1))}
                                            className="px-4 h-full hover:bg-gray-50 text-gray-600 transition-colors"
                                        >
                                            <Minus size={18} />
                                        </button>
                                        <input
                                            type="number"
                                            min="1"
                                            value={quantity}
                                            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                                            className="w-12 text-center font-bold text-lg focus:outline-none bg-transparent"
                                        />
                                        <button
                                            onClick={() => setQuantity(q => q + 1)}
                                            className="px-4 h-full hover:bg-gray-50 text-gray-600 transition-colors"
                                        >
                                            <Plus size={18} />
                                        </button>
                                    </div>
                                    <span className="text-gray-500 text-sm font-medium">ш</span>
                                </div>
                            </div>

                            {/* Unit Price Display */}
                            {product.unitPrice && (
                                <div className="text-gray-500 text-sm mb-3">
                                    (Нэгж үнэ: {product.unitPrice.replace(/₩/g, '₮')})
                                </div>
                            )}

                            {/* Weight / Capacity Display */}
                            <div className="text-gray-700 font-medium text-sm mb-3 flex items-start gap-2 bg-white p-2 rounded border border-gray-100">
                                <span className="text-gray-500 whitespace-nowrap">Жин:</span>
                                <span className="text-gray-900">
                                    {(weightInfo && weightInfo.value) ? weightInfo.value : "Барааны жин олдоогүй тул та чатаар мэдээлэл авна уу?"}
                                </span>
                            </div>

                            {/* Shipping Cost Breakdown - Clickable Cart Buttons */}
                            <div className="mt-2 space-y-3 p-3 bg-blue-50/50 rounded-lg border border-blue-100 mb-3 text-xs">
                                <h3 className="font-bold text-gray-500 uppercase tracking-wide mb-2">Тээврийн сонголтууд (Дэлгэрэнгүй)</h3>

                                {['ground', 'air'].map(type => {
                                    // 🏪 Use warehouse price for shipping calculation
                                    const breakdown = getPriceBreakdown(product, warehousePriceKRW, settings?.transportationRates, wonRate, type, quantity);
                                    if (!breakdown) return null;

                                    // Calculate variant-specific cartItemId
                                    const optionValues = Object.values(selectedOptions).sort();
                                    const currentOptionKey = optionValues.join('_');
                                    const currentCartItemId = currentOptionKey ? `${product.id}_${currentOptionKey}` : product.id;

                                    const cartItems = type === 'ground' ? groundItems : airItems;
                                    const isInCart = cartItems.some(item => (item.cartItemId || item.id) === currentCartItemId);

                                    const handleClick = () => {
                                        // Validation: Check if all options are selected
                                        if (product.options && product.options.length > 0) {
                                            const missingOptions = product.options.filter(opt => !selectedOptions[opt.name]);
                                            if (missingOptions.length > 0) {
                                                alert('Төрөл сонгоно уу!');
                                                return;
                                            }
                                        }

                                        if (isInCart) {
                                            if (type === 'ground') {
                                                removeFromGround(currentCartItemId);
                                            } else {
                                                removeFromAir(currentCartItemId);
                                            }
                                        } else {
                                            if (type === 'ground') {
                                                addToGround(product, selectedOptions, quantity);
                                            } else {
                                                addToAir(product, selectedOptions, quantity);
                                            }
                                            showToast(`${type === 'ground' ? 'Газраар' : 'Агаараар'} сагсанд нэмэгдлээ`, 'success');
                                        }
                                    };

                                    // Dynamic values based on currency
                                    const isMNT = currency === 'MNT';
                                    const sym = currencySymbol;

                                    const finalTotalDisplay = isMNT
                                        ? breakdown.finalMNT.toLocaleString()
                                        : breakdown.totalKRW.toLocaleString();

                                    const basePriceDisplay = isMNT
                                        ? Math.round(breakdown.basePriceKRW * wonRate).toLocaleString()
                                        : breakdown.basePriceKRW.toLocaleString();

                                    const shippingCostDisplay = isMNT
                                        ? Math.round(breakdown.shippingCostKRW * wonRate).toLocaleString()
                                        : breakdown.shippingCostKRW.toLocaleString();

                                    const rateDisplay = isMNT
                                        ? Math.round(breakdown.rateKRW * wonRate).toLocaleString()
                                        : breakdown.rateKRW.toLocaleString();

                                    const totalDisplay = isMNT
                                        ? Math.round(breakdown.totalKRW * wonRate).toLocaleString()
                                        : breakdown.totalKRW.toLocaleString();

                                    return (
                                        <button
                                            key={type}
                                            onClick={handleClick}
                                            className={`w-full flex flex-col gap-1 p-3 rounded-lg border-2 transition-all cursor-pointer hover:scale-[1.01] active:scale-[0.99] ${isInCart
                                                ? (type === 'ground' ? 'bg-blue-100 border-blue-400' : 'bg-orange-100 border-orange-400')
                                                : 'bg-white border-gray-200 hover:border-gray-400'
                                                }`}
                                        >
                                            <div className="flex justify-between items-center font-bold text-gray-800 text-sm">
                                                <span className="flex items-center gap-1">
                                                    {type === 'ground' ? '🚚 Газраар (14-20 хоногт):' : '✈️ Агаараар (7 хоногт):'}
                                                    {isInCart && <span className="text-green-600 text-xs ml-1">✓ Сагсанд</span>}
                                                </span>
                                                <span className={`text-xl ${type === 'ground' ? 'text-blue-600' : 'text-orange-600'}`}>
                                                    Нийт : {finalTotalDisplay}{sym}
                                                </span>
                                            </div>
                                            <div className="text-gray-600 text-[11px] sm:text-xs text-left space-y-0.5">
                                                <div>Барааны үнэ: <span className="font-semibold text-gray-800">{basePriceDisplay}{sym}</span></div>
                                                <div>Тээвэр: <span className="font-semibold text-gray-800">{shippingCostDisplay}{sym}</span> <span className="text-gray-400">({breakdown.weightDisplay} x {rateDisplay}{sym})</span></div>
                                                <div className="font-bold text-gray-900">Нийт: {totalDisplay}{sym}</div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>




                            {/* VAT included notice if needed */}

                        </div>



                        <div className="flex flex-col gap-3 mb-8">
                            {/* Product Inquiry Button */}
                            <button
                                onClick={handleProductInquiry}
                                className="w-full bg-white text-red-600 border-2 border-red-600 px-6 py-3 rounded-lg font-bold hover:bg-red-50 transition-all duration-200 flex items-center justify-center gap-3 text-lg shadow-sm active:scale-95"
                            >
                                <MessageCircle size={24} />
                                Барааны мэдээлэл авах
                            </button>

                            {/* Wishlist Button */}
                            <button
                                onClick={() => toggleWishlist(product)}
                                className={`w-full px-6 py-3 rounded-lg font-bold transition-all duration-200 flex items-center justify-center gap-2 text-md border-2 border-red-600 text-red-600 active:scale-95 ${isInWishlist(product.id)
                                    ? 'bg-red-50'
                                    : 'bg-white hover:bg-red-50'
                                    }`}
                            >
                                <Heart
                                    size={20}
                                    className={`${isInWishlist(product.id) ? 'fill-current' : ''}`}
                                />
                                {isInWishlist(product.id) ? 'ХАДГАЛСАН' : 'ХАДГАЛАХ'}
                            </button>

                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mt-12">
                    {/* Product Details (HTML) */}
                    {(product.description_mn || product.description) && (
                        <div className="mb-8">
                            <h3 className="text-lg font-bold text-gray-900 mb-4 border-b pb-2">Барааны дэлгэрэнгүй</h3>
                            <div
                                className="prose prose-sm max-w-none text-gray-700 leading-relaxed overflow-hidden [&_img]:max-w-full [&_img]:h-auto"
                                dangerouslySetInnerHTML={{
                                    __html: (product.description_mn || product.description)
                                        ?.replace(/src="\/mediapermalink/g, 'src="https://www.costco.co.kr/mediapermalink')
                                        .replace(/src="\/medias/g, 'src="https://www.costco.co.kr/medias')
                                }}
                            />
                        </div>
                    )}

                    {/* Specifications */}
                    {((product.specifications_mn?.length > 0) || (product.specifications?.length > 0)) && (
                        <div className="mb-8">
                            <h3 className="text-lg font-bold text-gray-900 mb-4 border-b pb-2">Үзүүлэлтүүд</h3>
                            <div className="divide-y">
                                {(product.specifications_mn?.length > 0 ? product.specifications_mn : (product.specifications || [])).map((spec, idx) => (
                                    <div key={idx} className="grid grid-cols-1 sm:grid-cols-3 py-3 gap-2">
                                        <dt className="font-medium text-gray-600 sm:col-span-1">{spec.name || spec.key}</dt>
                                        <dd className="text-gray-900 sm:col-span-2">
                                            <div
                                                className="prose prose-sm max-w-none [&_img]:max-w-full [&_img]:h-auto"
                                                dangerouslySetInnerHTML={{
                                                    __html: spec.value
                                                        ?.replace(/src="\/mediapermalink/g, 'src="https://www.costco.co.kr/mediapermalink')
                                                        .replace(/src="\/medias/g, 'src="https://www.costco.co.kr/medias')
                                                }}
                                            />
                                        </dd>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
