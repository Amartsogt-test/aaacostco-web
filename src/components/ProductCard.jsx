import { Share2, Heart, Timer, Star, MessageCircle, ShoppingCart, Check } from 'lucide-react';
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
import { getDisplayPricing, resolveDiscount } from '../utils/pricing';
import { formatMoney } from '../utils/format';
import LazyImage from './LazyImage';


// 🚀 Performance: Memoize to prevent re-renders during scroll
const ProductCard = memo(function ProductCard({ product, isFeatured }) {
    const { toggleWishlist, isInWishlist } = useWishlistStore();
    const { addToGround } = useCartStore();
    const { currency, showToast } = useUIStore();
    const { wonRate, setProductStatus } = useProductStore();
    const { settings } = useSettingsStore(); // Get settings for transport rates
    const { user } = useAuthStore();
    const navigate = useNavigate();

    const isAdmin = user?.isAdmin;

    const isLiked = isInWishlist(product.id);

    // 🏪 Centralised, unit-tested pricing — single source of truth (src/utils/pricing.js).
    // Cards show the warehouse price (estimatedWarehousePrice) as the main price.
    const { displayPrice, displayOldPrice, mainPriceKRW, currencySymbol, isExpired } =
        getDisplayPricing(product, { currency, wonRate, useWarehousePrice: true });

    // --- Discount display ---------------------------------------------------
    // A price is shown in RED only when we can also show the original price next
    // to it, so a "discounted" (red) price ALWAYS comes with a strikethrough
    // comparison. If the catalog provides a discount % but no stored original
    // price, we derive the original from the percentage so nothing looks
    // discounted without a reference price.
    // Tested, centralised rule (src/utils/pricing.js): a price is only shown in
    // red ("discounted") when there is an original price to show beside it.
    const { isDiscounted, comparisonOldPrice, percent: discountPct } = resolveDiscount({
        displayPrice,
        displayOldPrice,
        isExpired,
        hasDiscount: product.hasDiscount === true,
        discountValue: product.discountPercent ?? product.discount,
    });

    // 🎉 Нээлтийн хямдрал нь үнийг ШУУД ХАСАХГҮЙ — худалдан авсны дараа барааны дүнгийн
    // энэ хувьтай тэнцэх лояалти бонус оноо данс руу ороно. Тиймээс энд зөвхөн жинхэнэ
    // дэлгүүрийн хямдралыг (resolveDiscount) л үнэнд тусгаж, launch-ийг бонус тэмдэг болгон харуулна.
    const launchSale = settings?.launchSale;
    const launchNotExpired = !launchSale?.endsAt || Date.now() < new Date(launchSale.endsAt).getTime();
    const launchActive = (launchSale?.active !== false) && launchNotExpired;
    const launchPercent = launchActive ? Number(launchSale?.percent ?? 0) : 0;

    const finalDisplayPrice = displayPrice;
    const finalOldPrice = comparisonOldPrice;
    const finalIsDiscounted = isDiscounted;
    const baseDiscountPct = discountPct ?? Math.round(((comparisonOldPrice - displayPrice) / comparisonOldPrice) * 100);

    const handleShare = async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const shareName = product.name_mn || product.englishName || product.name;
        const shareUrl = `${window.location.origin}/product/${product.id}`;
        const shareData = {
            title: shareName,
            text: `${shareName} — Costco Mongolia дээрээс үзээрэй!`,
            url: shareUrl,
        };

        if (navigator.share) {
            try {
                await navigator.share(shareData);
            } catch {
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
    const [cartAdded, setCartAdded] = useState(false);

    useEffect(() => {
        if (!product.discountEndsAt) return;

        // Only the hour count is displayed, so updating once a minute is plenty —
        // a 1s interval would needlessly re-render every discounted card each second.
        const compute = () => {
            const diff = new Date(product.discountEndsAt) - new Date();
            if (diff <= 0) {
                setTimeLeft(null);
                return false;
            }
            setTimeLeft(`${Math.floor(diff / (1000 * 60 * 60))}ц`);
            return true;
        };

        if (!compute()) return; // already expired — nothing to tick
        const interval = setInterval(() => {
            if (!compute()) clearInterval(interval);
        }, 60000);

        return () => clearInterval(interval);
    }, [product.discountEndsAt]);

    const isInactive = product.status === 'inactive' || product.stock === 'outOfStock';

    return (
        <div className={`bg-white rounded-xl shadow-sm hover:shadow-lg transition flex flex-col h-full group overflow-hidden ${isInactive ? 'opacity-60 grayscale' : ''}`}>
            {/* Image Area */}
            <Link to={`/product/${product.id}`} className="relative aspect-square bg-white overflow-hidden block">
                <LazyImage
                    src={product.image}
                    alt={product.name}
                    className={`w-full h-full ${isInactive ? 'grayscale' : ''}`}
                    style={{ padding: '8px' }}
                />

                {/* Restock Warning Overlay (Top Left) */}
                {product.restockStatus === 'no_restock' && (
                    <div className="absolute top-2 left-2 z-10">
                        <span className="bg-red-600 text-white text-[9px] font-black px-2 py-0.5 rounded shadow-md uppercase tracking-wider animate-pulse">
                            Дахин ирэхгүй
                        </span>
                    </div>
                )}
                {product.restockStatus === 'uncertain' && (
                    <div className="absolute top-2 left-2 z-10">
                        <span className="bg-amber-500 text-white text-[9px] font-black px-2 py-0.5 rounded shadow-md uppercase tracking-wider">
                            Тодорхойгүй
                        </span>
                    </div>
                )}

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
                        className="h-3 w-auto object-contain bg-white/90 px-1 rounded shadow-sm border border-red-100"
                    />

                    {/* Timer - only show if discount is active */}
                    {product.hasDiscount === true && product.discount && !isInactive && timeLeft && (
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

                {/* Weight, Product Code and Package Display on Card */}
                {(() => {
                    const weightInfo = getProductWeight(product);
                    const displayValue = (weightInfo && !weightInfo.value.includes('асууна уу'))
                        ? (weightInfo.value.includes('=') ? weightInfo.value.split('=')[1].trim() : weightInfo.value)
                        : '?';

                    return (
                        <div className="text-[10px] text-gray-500 font-medium mb-2 flex flex-wrap items-center gap-1.5">
                            {product.packageQuantity ? (
                                <span className="bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 text-costco-blue font-bold flex items-center gap-0.5">
                                    📦 {product.packageQuantity}{product.packageUnit || '개'}
                                </span>
                            ) : (
                                <span className="bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200 text-gray-700">
                                    Жин: {displayValue}
                                </span>
                            )}
                            <span className="bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200 text-gray-700">
                                Код: {product.id}
                            </span>
                        </div>
                    );
                })()}




                <div className="mt-auto">
                    <div className="flex flex-col gap-0 items-start mb-3 w-full">
                        {/* Badges */}
                        <div className="flex flex-col items-start gap-1 mb-1">
                            {product.additionalCategories?.includes('New') && !isInactive && (
                                <span className="bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm uppercase tracking-wider">
                                    NEW
                                </span>
                            )}
                            {launchPercent > 0 && !isInactive && (
                                <span className="text-[11px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded whitespace-nowrap">
                                    🎉 +{launchPercent}% бонус оноо (+{formatMoney(Math.round(finalDisplayPrice * launchPercent / 100), currencySymbol)})
                                </span>
                            )}
                            {finalIsDiscounted && isDiscounted && (
                                <span className="text-sm font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded whitespace-nowrap">
                                    Costco хямдрал -{baseDiscountPct}%
                                </span>
                            )}
                        </div>

                        {/* Prices: Old first, then New */}
                        <div className="flex items-center gap-2">
                            {finalIsDiscounted && (
                                <span className="text-sm text-gray-400 line-through">
                                    {formatMoney(finalOldPrice, currencySymbol)}
                                </span>
                            )}
                            <span className={`text-lg font-bold flex items-center gap-1 ${finalIsDiscounted ? 'text-costco-red' : 'text-gray-900'}`}>
                                {formatMoney(finalDisplayPrice, currencySymbol)}
                                {isFeatured && <Star size={16} fill="currentColor" className="text-costco-blue" />}
                            </span>
                        </div>

                        {/* Shipping Prices / Quick Add Buttons */}
                        <div className="flex flex-col gap-1 mt-1 w-full">
                            {['ground', 'air'].map(type => {
                                // Use the STORE PRICE (mainPriceKRW) directly — launch is a
                                // post-purchase bonus, not a price cut, so it must NOT reduce this.
                                const finalPrice = calculateFinalPrice(product, mainPriceKRW, settings?.transportationRates, wonRate, type);

                                return (
                                    <div
                                        key={type}
                                        className="w-full text-[12px] font-medium flex items-center justify-between px-2 py-1 rounded-lg bg-gray-50 border border-gray-100"
                                    >
                                        <div className="flex items-center gap-1.5">
                                            <span className={`${type === 'ground' ? 'text-blue-600' : 'text-orange-600'} text-[10px]`}>
                                                {type === 'ground' ? '🚢' : '✈️'}
                                            </span>
                                            <span className="text-gray-600">
                                                {type === 'ground' ? 'Газраар' : 'Агаараар'}
                                            </span>
                                        </div>
                                        <span className="text-gray-900 font-bold whitespace-nowrap ml-2">
                                            {finalPrice.toLocaleString()}₮
                                        </span>
                                    </div>
                                );
                            })}
                        </div>


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
                                aria-label="Хуваалцах"
                                className="flex-1 aspect-square max-w-[40px] bg-gray-100 rounded-xl flex flex-col items-center justify-center text-gray-500 hover:bg-gray-200 transition"
                            >
                                <Share2 size={16} />
                            </button>

                            <button
                                onClick={handleLike}
                                aria-label={isLiked ? 'Хадгалснаас хасах' : 'Хадгалах'}
                                aria-pressed={isLiked}
                                className={`flex-1 aspect-square max-w-[40px] rounded-xl flex flex-col items-center justify-center transition ${isLiked ? 'bg-gray-100 text-costco-blue' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                            >
                                <Heart size={16} fill={isLiked ? "currentColor" : "none"} />
                            </button>

                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (isInactive) {
                                        showToast('Идэвхгүй бараа — захиалах боломжгүй', 'warning');
                                        return;
                                    }
                                    if (displayPrice === null || displayPrice === undefined) {
                                        showToast('Үнэ тооцоологдоогүй байна', 'error');
                                        return;
                                    }
                                    addToGround(product, null, 1);
                                    showToast('Сагсанд нэмэгдлээ', 'success');
                                    setCartAdded(true);
                                    setTimeout(() => setCartAdded(false), 1500);
                                }}
                                className={`flex-1 aspect-square max-w-[40px] rounded-xl flex flex-col items-center justify-center transition-all duration-300 ${
                                    cartAdded ? 'bg-green-500 text-white scale-110 shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-costco-blue'
                                }`}
                                title="Сагсанд нэмэх (Газраар)"
                                aria-label="Сагсанд нэмэх"
                            >
                                {cartAdded ? <Check size={16} className="animate-bounce" /> : <ShoppingCart size={16} />}
                            </button>

                            {/* HIDDEN PER USER REQUEST
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    openWithProduct(product);
                                    if (window.innerWidth < 1024) {
                                        navigate('/chat');
                                    }
                                }}
                                className="flex-1 aspect-square max-w-[40px] bg-gray-100 text-gray-500 rounded-xl flex flex-col items-center justify-center hover:bg-gray-200 transition"
                                title="Мэдээлэл асуух"
                            >
                                <MessageCircle size={16} />
                            </button>
                            */}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

export default ProductCard;
