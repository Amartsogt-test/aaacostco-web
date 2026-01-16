import { Share2, Heart, Timer, ShoppingCart, Bell, Star } from 'lucide-react';
import React, { useState, useEffect, memo } from 'react';
import { Link } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import { useWishlistStore } from '../store/wishlistStore';
import { useProductStore } from '../store/productStore';
import { useUIStore } from '../store/uiStore';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { Edit2, EyeOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getProductWeight, calculateFinalPrice } from '../utils/productUtils';


// 🚀 Performance: Memoize to prevent re-renders during scroll
const ProductCard = memo(function ProductCard({ product, isFeatured }) {
    const addToCart = useCartStore(state => state.addToCart);
    const { toggleWishlist, isInWishlist } = useWishlistStore();
    const items = useCartStore(state => state.items);
    const { currency, showToast } = useUIStore();
    const { wonRate, setProductStatus } = useProductStore();
    const { settings } = useSettingsStore(); // Get settings for transport rates
    const { user } = useAuthStore();
    const navigate = useNavigate();

    const isAdmin = user?.isAdmin;

    const isLiked = isInWishlist(product.id);

    // Use sanitized fields from scraper
    const priceInKRW = product.price || product.priceKRW || 0;

    // Calculate Display Price
    // If MNT, use the new inclusive formula: (Price + Shipping) * Rate
    // If KRW, just show base KRW (or should we show total KRW? Usually just base for KRW view)
    // User request: "transport price in won" implies it affects the final MNT cost.
    // For KRW view, let's keep it simple (base price) unless requested otherwise.

    // Expiration Check Logic (New)
    const now = new Date();
    const discountEnd = product.discountEndDate ? new Date(product.discountEndDate) : null;
    const isExpired = discountEnd && discountEnd < now;

    // Determine Effective Base Price and Display Price
    // If expired, we ignore the 'discount' and treat originalPrice as the current price if available,
    // OR we just hide the originalPrice (remove the strikethrough) and show the current price as normal.
    // However, usually 'price' field IS the discounted price. So if expired, we should revert to 'originalPrice'.

    let effectivePriceInKRW = product.price || product.priceKRW || 0;
    let effectiveOldPriceInKRW = product.originalPrice || product.originalPriceKRW || product.oldPrice || product.baseOldPrice || 0;

    if (isExpired && effectiveOldPriceInKRW > 0) {
        // REVERT: Use the old price as the current price
        effectivePriceInKRW = effectiveOldPriceInKRW;
        effectiveOldPriceInKRW = 0; // Hide the "old" price since it's now current
    }

    let displayPrice;
    if (currency === 'MNT') {
        displayPrice = calculateFinalPrice(
            product,
            effectivePriceInKRW,
            settings?.transportationRates,
            wonRate
        );
    } else {
        displayPrice = effectivePriceInKRW;
    }

    let displayOldPrice = null;
    if (effectiveOldPriceInKRW && effectiveOldPriceInKRW > effectivePriceInKRW) {
        if (currency === 'MNT') {
            displayOldPrice = calculateFinalPrice(
                product,
                effectiveOldPriceInKRW,
                settings?.transportationRates,
                wonRate
            );
        } else {
            displayOldPrice = effectiveOldPriceInKRW;
        }
    }

    // Also use discountPercent from scraper if available
    const discountPercentFromData = product.discountPercent || product.discount;
    const isDiscounted = !!displayOldPrice || !!discountPercentFromData;

    const currencySymbol = currency === 'MNT' ? '₮' : '₩';

    const handleShare = async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const shareUrl = `${window.location.origin}/product/${product.id}`;
        const shareData = {
            title: product.name,
            text: `Check out ${product.name} at Costco Mongolia!`,
            url: shareUrl,
        };

        if (navigator.share) {
            try {
                await navigator.share(shareData);
            } catch (err) {
                // User cancelled or share failed
                // Share skipped
            }
        } else {
            // Fallback for desktop/unsupported browsers
            try {
                await navigator.clipboard.writeText(shareUrl);
                showToast('Холбоос хуулагдлаа', 'success');
            } catch (err) {
                console.error('Clipboard failed', err);
                showToast('Хуулах боломжгүй байна', 'error');
            }
        }
    };




    const handleLike = (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleWishlist(product);
    };

    // Countdown Logic
    const [timeLeft, setTimeLeft] = useState(null);

    useEffect(() => {
        if (!product.discountEndsAt) return;

        const interval = setInterval(() => {
            const now = new Date();
            const end = new Date(product.discountEndsAt);
            const diff = end - now;

            if (diff <= 0) {
                setTimeLeft(null);
                clearInterval(interval);
            } else {
                const hours = Math.floor(diff / (1000 * 60 * 60));

                setTimeLeft(`${hours}ц`);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [product.discountEndsAt]);

    const isInactive = product.status === 'inactive' || product.stock === 'outOfStock';

    return (
        <div className={`bg-white rounded-xl shadow-sm hover:shadow-lg transition flex flex-col h-full group overflow-hidden ${isInactive ? 'opacity-60 grayscale' : ''}`}>
            {/* Image Area */}
            <Link to={`/product/${product.id}`} className="relative aspect-square bg-white overflow-hidden block">
                <img
                    src={product.image}
                    alt={product.name}
                    className={`w-full h-full object-contain p-2 group-hover:scale-105 transition duration-300 ${isInactive ? 'grayscale' : ''}`}
                    loading="lazy"
                    decoding="async"
                />

                {/* Out of Stock / Inactive Overlay */}
                {isInactive && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <span className="bg-gray-800 text-white text-xs font-bold px-3 py-1.5 rounded-full">
                            Дууссан
                        </span>
                    </div>
                )}

                {/* Labels Overlay (Top Right) */}
                <div className="absolute top-2 right-2 flex flex-col gap-1 items-end z-10">
                    {/* Costco Label (Logo) */}
                    <img
                        src="/costco_logo_small.png"
                        alt="Costco"
                        className="h-4 w-auto object-contain bg-white/90 px-1 rounded shadow-sm border border-red-100"
                    />

                    {/* Timer */}
                    {product.discount && !isInactive && timeLeft && (
                        <span className="bg-yellow-400 text-black text-[10px] px-2 py-0.5 font-bold rounded flex items-center gap-1 shadow-sm">
                            <Timer size={12} />
                            {timeLeft}
                        </span>
                    )}
                </div>
            </Link>

            {/* Content */}
            <div className="px-2 py-3 flex flex-col flex-1 border-t">
                <Link to={`/product/${product.id}`} className="font-bold text-gray-900 leading-tight mb-1 line-clamp-2 min-h-[2.5em] hover:text-costco-blue transition" title={product.name_mn || product.englishName || product.name}>
                    {product.name_mn || product.englishName || product.name}
                </Link>

                {/* Weight Display on Card */}
                {(() => {
                    const weightInfo = getProductWeight(product);
                    const displayValue = (weightInfo && !weightInfo.value.includes('асууна уу'))
                        ? (weightInfo.value.includes('=') ? weightInfo.value.split('=')[1].trim() : weightInfo.value)
                        : '?';

                    return (
                        <div className="text-[10px] text-gray-500 font-medium mb-2 flex items-center gap-1">
                            <span className="bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200 text-gray-700">
                                Жин: {displayValue}
                            </span>
                        </div>
                    );
                })()}




                <div className="mt-auto">
                    <div className="flex flex-col gap-0 items-start mb-3">
                        <div className="flex items-center gap-2">
                            <span className={`text-lg font-bold flex items-center gap-1 ${isDiscounted ? 'text-costco-red' : 'text-gray-900'}`}>
                                {(displayPrice || 0).toLocaleString()}{currencySymbol}
                                {isFeatured && <Star size={16} fill="currentColor" className="text-costco-blue" />}
                            </span>

                            {/* New Badge */}
                            {product.additionalCategories?.includes('New') && !isInactive && (
                                <span className="bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm uppercase tracking-wider">
                                    NEW
                                </span>
                            )}

                            {/* Discount Percentage Badge */}
                            {(product.discount || displayOldPrice) && (
                                <span className="text-sm font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded">
                                    {product.discount
                                        ? (typeof product.discount === 'number' ? `-${product.discount}%` : product.discount)
                                        : `-${Math.round(((displayOldPrice - displayPrice) / displayOldPrice) * 100)}%`
                                    }
                                </span>
                            )}
                        </div>
                        {displayOldPrice && (
                            <span className="text-sm text-gray-400 line-through">
                                {displayOldPrice.toLocaleString()}{currencySymbol}
                            </span>
                        )}


                    </div>

                    {/* Action Buttons Row */}
                    <div className="flex flex-col gap-3 mb-2">
                        {/* Admin Action Row */}
                        {isAdmin && (
                            <div className="flex gap-2 w-full mb-1">
                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        navigate(`/admin/add-product?id=${product.id}`);
                                    }}
                                    className="flex-1 flex items-center justify-center gap-2 py-2 bg-blue-50 text-costco-blue rounded-xl text-xs font-bold hover:bg-blue-100 transition"
                                >
                                    <Edit2 size={14} />
                                    Засах
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        const newStatus = product.status === 'inactive' ? 'active' : 'inactive';
                                        setProductStatus(product.id, newStatus);
                                        showToast(newStatus === 'inactive' ? 'Идэвхгүй болголоо' : 'Идэвхтэй болголоо', 'info');
                                    }}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition ${product.status === 'inactive'
                                        ? 'bg-green-50 text-green-600 hover:bg-green-100'
                                        : 'bg-orange-50 text-orange-600 hover:bg-orange-100'
                                        }`}
                                >
                                    <EyeOff size={14} />
                                    {product.status === 'inactive' ? 'Идэвхтэй' : 'Идэвхгүй'}
                                </button>
                            </div>
                        )}

                        {/* Secondary Actions */}
                        <div className="flex gap-3 w-full justify-center mt-1">
                            <button
                                onClick={handleShare}
                                className="flex-1 aspect-square max-w-[40px] bg-gray-100 rounded-xl flex flex-col items-center justify-center text-gray-500 hover:bg-gray-200 transition"
                            >
                                <Share2 size={16} />
                            </button>

                            <button
                                onClick={handleLike}
                                className={`flex-1 aspect-square max-w-[40px] rounded-xl flex flex-col items-center justify-center transition ${isLiked ? 'bg-gray-100 text-costco-blue' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                            >
                                <Heart size={16} fill={isLiked ? "currentColor" : "none"} />
                            </button>
                            <button
                                onClick={(e) => {
                                    e.preventDefault(); // Prevent link navigation
                                    e.stopPropagation();

                                    const existingItem = items.find(item => item.id === product.id);

                                    if (existingItem) {
                                        useCartStore.getState().removeFromCart(product.id);
                                        showToast('Сагснаас хасагдлаа', 'info');
                                    } else {
                                        addToCart(product);
                                        showToast('Сагсанд нэмэгдлээ', 'success');
                                    }
                                }}
                                className={`flex-1 aspect-square max-w-[40px] rounded-xl flex flex-col items-center justify-center transition ${items.some(i => i.id === product.id)
                                    ? 'bg-gray-100 text-costco-blue hover:bg-gray-200'
                                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                                title={items.some(i => i.id === product.id) ? "Сагснаас хасах" : "Сагсанд нэмэх"}
                            >
                                <ShoppingCart size={16} fill={items.some(i => i.id === product.id) ? "currentColor" : "none"} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

export default ProductCard;
