import React, { useState, useEffect, useRef, Suspense } from 'react';
import { Plus, Minus, Trash2, ShoppingCart, ChevronDown, ChevronUp, MapPin, Map, Plane, Ship, AlertTriangle, Lightbulb, MessageCircle } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import { useChatStore } from '../store/chatStore';
import { useProductStore } from '../store/productStore';
import { useUIStore } from '../store/uiStore';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { getPriceBreakdown } from '../utils/productUtils';
import { splitIntoShipments, SHIPMENT_VALUE_LIMIT_MNT } from '../utils/shipments';
import { formatAmount } from '../utils/format';
import { trackEvent } from '../utils/analytics';
import { callFunction } from '../firebase';
import ConfirmationModal from './ConfirmationModal';

// Consolidated-express duty-free cap for one individual's parcel: customs value
// ≤ 660,000₮ AND no more than 2 of the same item («Хувь хүний барааны гаалийн
// мэдүүлэг» — чөлөөлөлтийн бүс). Orders over the cap are split automatically
// into several parcels, each declared separately under the recipient's name.
const CUSTOMS_FREE_LIMIT_MNT = SHIPMENT_VALUE_LIMIT_MNT; // 660,000₮
const CUSTOMS_SAME_ITEM_LIMIT = 2;

// Mongolian individual register: 2 Cyrillic letters + 8 digits (e.g. УБ12345678).
// Required + validated for cross-border orders so the customs declaration isn't
// rejected for a missing/malformed register.
const REGISTER_RE = /^[А-ЯЁӨҮ]{2}\d{8}$/;
const isValidRegister = (r) => REGISTER_RE.test((r || '').trim().toUpperCase());


// Updated Cart Item Component
// eslint-disable-next-line no-unused-vars
function CartItem({ item, updateQuantity, onDeleteClick, onMoveClick, MoveIcon, moveLabel, wonRate, currency, currencySymbol, shippingType, settings }) {
    // 🏪 Use warehouse price as base if available
    const onlinePriceKRW = item.price?.value || item.price || 0;
    const basePriceKRW = item.estimatedWarehousePrice || onlinePriceKRW;
    const totalPriceKRW = basePriceKRW * item.quantity;
    const totalPriceMNT = Math.round(totalPriceKRW * wonRate);
    const breakdown = getPriceBreakdown(item, basePriceKRW, settings?.transportationRates, wonRate, shippingType, item.quantity);

    return (
        <div className="bg-white p-3 rounded-lg border border-gray-100 flex gap-3 group">
            <Link to={`/product/${item.id}`} className="w-20 h-20 bg-white flex-shrink-0 border rounded overflow-hidden p-1 relative cursor-pointer hover:border-blue-300 transition-colors">
                <img src={item.image} alt={item.name} className="w-full h-full object-contain" loading="lazy" decoding="async" onError={(e) => { e.target.style.visibility = 'hidden'; }} />
            </Link>

            <div className="flex-1 flex flex-col justify-between">
                <div className="flex justify-between gap-2">
                    <div className="min-w-0">
                        <h3 className="font-bold text-gray-900 line-clamp-2 text-sm leading-tight mb-0.5">{item.name}</h3>
                        <p className="text-[10px] text-gray-400 font-semibold mb-1">Код: {item.id}</p>
                        {/* Options display */}
                        {item.selectedOptions && Object.entries(item.selectedOptions).map(([, value], idx) => (
                            <p key={idx} className="text-[10px] text-blue-600 font-medium">
                                • {value === '무향' ? 'Үнэргүй' : value === '라벤더' ? 'Лаванда' : value}
                            </p>
                        ))}
                        {breakdown && breakdown.totalWeightKg > 0 && (
                            <p className="text-[10px] text-gray-500 mt-1">
                                Тээвэр: {breakdown.weightDisplay} × {breakdown.rateDisplay} = <span className="font-semibold text-gray-700">{breakdown.shippingDisplay}</span>
                            </p>
                        )}
                    </div>
                    <div className="text-right">
                        <p className="font-bold text-sm text-gray-900 whitespace-nowrap">
                            {currency === 'MNT' ? totalPriceMNT.toLocaleString() : totalPriceKRW.toLocaleString()}{currencySymbol}
                        </p>
                        <p className="text-[10px] text-gray-400 whitespace-nowrap">
                            ({currency === 'MNT' ? totalPriceKRW.toLocaleString() + '₩' : totalPriceMNT.toLocaleString() + '₮'})
                        </p>
                    </div>
                </div>

                <div className="flex items-center justify-between mt-2">
                    {/* Move and Delete Buttons */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onMoveClick}
                            className="flex items-center gap-1 text-[10px] font-bold text-blue-500 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded transition-colors"
                            title={moveLabel}
                        >
                            <MoveIcon size={12} />
                            {moveLabel}
                        </button>
                    </div>

                    {/* Quantity Control */}
                    <div className="flex items-center border rounded-lg h-8">
                        <button
                            onClick={() => {
                                if (item.quantity === 1) {
                                    onDeleteClick(item.cartItemId || item.id);
                                } else {
                                    updateQuantity(item.cartItemId || item.id, item.quantity - 1);
                                }
                            }}
                            className="px-2 hover:bg-gray-50 text-gray-600 disabled:opacity-50 h-full flex items-center"
                            aria-label="Тоо хорогдуулах"
                        >
                            <Minus size={14} />
                        </button>
                        <span className="w-8 text-center font-medium text-sm">{item.quantity}</span>
                        <button
                            onClick={() => updateQuantity(item.cartItemId || item.id, item.quantity + 1)}
                            className="px-2 hover:bg-gray-50 text-gray-600 h-full flex items-center"
                            aria-label="Тоо нэмэх"
                        >
                            <Plus size={14} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function CartContent() {
    // ... (state remains same)
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isWarningModalOpen, setIsWarningModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [deleteFromCart, setDeleteFromCart] = useState(null); // 'ground' or 'air'

    // Updated Store Access
    const cartStore = useCartStore();
    const {
        checkoutState = {},
        setCheckoutState
    } = cartStore;

    // Mapping store state to local variables for easier migration
    const {
        recipientName = '',
        recipientPhone = '',
        recipientPhone2 = '',
        recipientRegister = '',
        recipientCustomsAddress = '',
        couponCode = '',
        couponDiscount = 0,
        deliveryMode = 'pickup',
        selectedBranch = '',
        deliveryLocation = null,
        deliveryAddressInfo = '',
        deliveryNotes = '',
        isAlternativeReceiver = false,
        koreaAddress = '',
        koreaPhone = ''
    } = checkoutState || {};

    // Setters wrap setCheckoutState
    const setRecipientName = (val) => setCheckoutState({ recipientName: val });
    const setRecipientPhone = (val) => setCheckoutState({ recipientPhone: val });
    const setRecipientPhone2 = (val) => setCheckoutState({ recipientPhone2: val });
    const setRecipientRegister = (val) => setCheckoutState({ recipientRegister: val });
    const setRecipientCustomsAddress = (val) => setCheckoutState({ recipientCustomsAddress: val });
    const setDeliveryMode = (val) => setCheckoutState({ deliveryMode: val });
    const setDeliveryAddressInfo = (val) => setCheckoutState({ deliveryAddressInfo: val });
    const setDeliveryNotes = (val) => setCheckoutState({ deliveryNotes: val });
    const setIsAlternativeReceiver = (val) => setCheckoutState({ isAlternativeReceiver: val });
    const setKoreaAddress = (val) => setCheckoutState({ koreaAddress: val });
    const setKoreaPhone = (val) => setCheckoutState({ koreaPhone: val });
    const setSelectedBranch = (val) => setCheckoutState({ selectedBranch: val }); // Though better to use LocationPage logic

    // Dual cart system
    const {
        groundItems,
        airItems,
        updateGroundQuantity,
        updateAirQuantity,
        removeFromGround,
        removeFromAir,
        moveToAir,
        moveToGround
    } = useCartStore();

    const { currency, showToast } = useUIStore();
    const currencySymbol = currency === 'MNT' ? '₮' : '₩';
    
    const { wonRate } = useProductStore();
    const { user } = useAuthStore();
    const { settings, fetchSettings } = useSettingsStore();
    const navigate = useNavigate();

    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('wire'); // online default (bank transfer removed)

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    // Calculate base item totals (KRW) and shipping totals (MNT) separately
    const calculateSectionDetails = (items, shippingType) => {
        return items.reduce((acc, item) => {
            const onlinePriceKRW = item.price?.value || item.price || 0;
            const basePriceKRW = item.estimatedWarehousePrice || onlinePriceKRW;
            const breakdown = getPriceBreakdown(item, basePriceKRW, settings?.transportationRates, wonRate, shippingType, item.quantity);
            
            return {
                itemsKRW: acc.itemsKRW + (breakdown?.basePriceKRW || 0),
                shippingMNT: acc.shippingMNT + (breakdown?.shippingCostMNT || 0)
            };
        }, { itemsKRW: 0, shippingMNT: 0 });
    };

    const groundDetails = calculateSectionDetails(groundItems, 'ground');
    const airDetails = calculateSectionDetails(airItems, 'air');

    const totalItemsKRW = groundDetails.itemsKRW + airDetails.itemsKRW;
    const totalShippingMNT = groundDetails.shippingMNT + airDetails.shippingMNT;

    // Total items in MNT
    const rawTotalItemsMNT = totalItemsKRW * wonRate;
    
    // Tier Discount
    const tier = user?.tier || 'Silver';
    const tierLower = tier.toLowerCase() === 'member' ? 'silver' : tier.toLowerCase();
    const discountRate = settings?.discountRates?.[tierLower] || 0;
    const tierDiscountMNT = Math.round(rawTotalItemsMNT * (discountRate / 100));

    // 🎉 Нээлтийн хямдрал: үнийг ШУУД ХАСАХГҮЙ. Идэвхтэй үед худалдан авалтын дараа
    // (төлбөр баталгаажихад) барааны дүнгийн 5%-тай тэнцэх лояалти бонус оноо данс руу
    // нь ороно — энэ нь сервер талд (notifyOrderStage CF) воноор бодогдож олгогдоно.
    // Анхдагчаар идэвхтэй (админ active:false болговол л унтарна).
    const launchSale = settings?.launchSale;
    const launchNotExpired = !launchSale?.endsAt || Date.now() < new Date(launchSale.endsAt).getTime();
    const launchActive = (launchSale?.active !== false) && launchNotExpired;
    const launchPercent = launchActive ? Number(launchSale?.percent ?? 5) : 0;
    // Зөвхөн МЭДЭЭЛЛИЙН зорилгоор: хэрэглэгчид хэдэн төгрөгийн бонус ороxыг харуулна.
    const launchBonusMNT = Math.round(rawTotalItemsMNT * (launchPercent / 100));

    const totalItemsMNT = rawTotalItemsMNT - tierDiscountMNT;

    const grandTotalMNT = totalItemsMNT + totalShippingMNT;

    // Delivery Fee logic
    const deliveryFeeMNT = deliveryMode === 'delivery' ? (settings?.deliveryFee || 5000) : 0;
    const currentDeliveryFee = deliveryFeeMNT;

    // 🎁 Лояалти оноо зарцуулах: үлдэгдэл болон барааны дүнгийн 50%-аас хэтрэхгүй.
    // Оноо нь воноор хадгалагддаг тул ханшаар (wonRate) ₮ болгон хөрвүүлж хасна.
    const [redeemPoints, setRedeemPoints] = useState(false); // 🎁 use loyalty points (declared before first use)
    const pointsBalanceKRW = Math.max(0, Math.round(Number(user?.loyaltyPointsKRW) || 0));
    const maxRedeemKRW = Math.min(pointsBalanceKRW, Math.floor(totalItemsKRW * 0.5));
    const redeemKRW = (redeemPoints && maxRedeemKRW > 0) ? maxRedeemKRW : 0;
    const pointsDiscountMNT = Math.round(redeemKRW * wonRate);

    const total = Math.max(0, Math.round(grandTotalMNT + currentDeliveryFee - (couponDiscount || 0) - pointsDiscountMNT));

    const totalItemCount = groundItems.length + airItems.length;

    // Customs handling (consolidated express): flag items with 3+ of the same
    // kind; when the GOODS value (customs value, always MNT) exceeds the 3M₮
    // duty-free cap, the order is split automatically into several parcels —
    // each under the cap, declared separately under the recipient's name.
    const highQtyItems = [...groundItems, ...airItems].filter(it => (it.quantity || 0) > CUSTOMS_SAME_ITEM_LIMIT);
    // Customs value = goods only (no shipping/discounts), computed inside the memo.
    const shipmentPlan = React.useMemo(() => {
        const all = [
            ...groundItems.map(i => ({ ...i, shippingMethod: 'ground' })),
            ...airItems.map(i => ({ ...i, shippingMethod: 'air' })),
        ];
        if (all.length === 0) return [];
        const unitMNT = (it) => ((it.estimatedWarehousePrice || it.price?.value || it.price || 0) * wonRate);
        const totalMNT = all.reduce((a, it) => a + unitMNT(it) * (it.quantity || 1), 0);
        // Under the cap → one parcel, exactly as before (no behaviour change).
        if (totalMNT <= CUSTOMS_FREE_LIMIT_MNT) {
            return [{ items: all, valueMNT: Math.round(totalMNT), oversize: false }];
        }
        return splitIntoShipments(all, unitMNT);
    }, [groundItems, airItems, wonRate]);
    const willSplit = shipmentPlan.length > 1;
    const oversizeShipments = shipmentPlan.filter(s => s.oversize);
    const showCustomsWarning = highQtyItems.length > 0 || willSplit || oversizeShipments.length > 0;

    // Brokerage consent (зуучлалын гэрээ) — required per order: the customer
    // confirms they are the owner of the goods and appoints the company as
    // purchasing & forwarding agent. Local state on purpose, so every new
    // checkout asks again.
    const [brokerageConsent, setBrokerageConsent] = useState(false);

    // Customs data requirements: cross-border (pickup/delivery) orders need a valid
    // register; pickup additionally needs the recipient's address. Plus flag any
    // restricted/prohibited items in the cart.
    const isCrossBorder = deliveryMode !== 'korea_local';
    const registerInvalid = isCrossBorder && !isValidRegister(recipientRegister);
    const pickupAddressMissing = deliveryMode === 'pickup' && !recipientCustomsAddress.trim();
    const restrictedItems = [...groundItems, ...airItems].filter(it => it.restricted);

    // Single source of truth for the pay button — cross-border orders also need
    // the brokerage consent (зуучлалын гэрээ) ticked before checkout.
    const checkoutDisabled = totalItemCount === 0
        || !recipientName
        || (deliveryMode !== 'korea_local' && recipientPhone.length < 8)
        || (deliveryMode === 'korea_local' && !koreaAddress)
        || (deliveryMode === 'pickup' && !selectedBranch)
        || registerInvalid
        || pickupAddressMissing
        || (isCrossBorder && !brokerageConsent);

    // Selecting a payment method IS the checkout action now (the separate "Төлбөр төлөх"
    // sticky button was removed). Tapping Онлайн / Хуваан төлөх sets the method and goes
    // straight to /payment with the prepared order state.
    const proceedToPayment = (method) => {
        if (checkoutDisabled) {
            showToast('Захиалга өгөхийн өмнө мэдээллээ бүрэн бөглөж, зөвшөөрлөө өгнө үү.', 'warning', 4000);
            return;
        }
        const mapItem = (item, shippingMethod) => {
            const onlinePriceKRW = item.price?.value || item.price || 0;
            const basePriceKRW = item.estimatedWarehousePrice || onlinePriceKRW;
            return { ...item, shippingMethod, finalPrice: basePriceKRW };
        };
        const processedGround = groundItems.map(i => mapItem(i, 'ground'));
        const processedAir = airItems.map(i => mapItem(i, 'air'));
        const processedShipments = shipmentPlan.map(s => ({
            valueMNT: s.valueMNT,
            oversize: s.oversize,
            items: s.items.map(i => mapItem(i, i.shippingMethod || 'ground')),
        }));
        setSelectedPaymentMethod(method);
        trackEvent('begin_checkout', { value: total, currency: 'MNT', items: totalItemCount });
        navigate('/payment', {
            state: {
                totalValue: total,
                tierDiscount: tierDiscountMNT,
                tierDiscountRate: discountRate,
                launchSale: launchActive, // 🎉 launch bonus flag: CF credits 5% as loyalty points on confirm
                pointsRedeemedKRW: redeemKRW,
                pointsDiscount: pointsDiscountMNT,
                processedItems: [...processedGround, ...processedAir],
                processedShipments,
                brokerageConsent,
                currency: 'MNT',
                paymentMethod: method,
            },
        });
    };

    // Saved addresses (from the user profile) — let the shopper fill the address
    // with one tap instead of retyping (also standardises addresses for customs).
    const savedAddresses = user?.addresses || [];
    const applySavedAddress = (addr) => {
        if (!addr) return;
        if (deliveryMode === 'delivery') {
            setDeliveryAddressInfo(addr.detail || '');
            if (addr.position) setCheckoutState({ deliveryLocation: { lat: addr.position.lat, lng: addr.position.lng } });
        } else {
            setRecipientCustomsAddress(addr.detail || '');
        }
    };

    // Promo code — validated server-side (validateCoupon); discount computed in the
    // display currency. Percent works in any currency; fixed amounts are in MNT.
    const [couponInput, setCouponInput] = useState('');
    const [couponBusy, setCouponBusy] = useState(false);
    const [couponError, setCouponError] = useState('');
    const applyCoupon = async () => {
        const code = couponInput.trim().toUpperCase();
        if (!code) return;
        setCouponBusy(true); setCouponError('');
        try {
            const res = await callFunction('validateCoupon', { code, subtotalMNT: Math.round(grandTotalMNT) });
            const c = res?.data;
            if (!c?.valid) throw new Error('Купон буруу байна.');
            const discount = c.type === 'fixed'
                ? c.value
                : Math.round(grandTotalMNT * (c.value / 100));
            setCheckoutState({ couponCode: c.code, couponDiscount: discount });
        } catch (err) {
            setCheckoutState({ couponCode: '', couponDiscount: 0 });
            setCouponError(err?.message || 'Купон хэрэглэж чадсангүй.');
        } finally {
            setCouponBusy(false);
        }
    };
    const removeCoupon = () => { setCheckoutState({ couponCode: '', couponDiscount: 0 }); setCouponInput(''); setCouponError(''); };

    // A coupon's discount is stored as an absolute amount at apply time. If the cart
    // contents change afterwards it goes stale (a % coupon no longer matches; a
    // shrunk cart could be over-discounted, even free). Clear any applied coupon when
    // the cart contents change, so the shopper re-applies it against the new total.
    const cartSig = [...groundItems, ...airItems].map((i) => `${i.cartItemId || i.id}:${i.quantity}`).join('|');
    const prevSigRef = useRef(cartSig);
    useEffect(() => {
        if (prevSigRef.current !== cartSig) {
            prevSigRef.current = cartSig;
            if (couponCode) {
                setCheckoutState({ couponCode: '', couponDiscount: 0 });
                setCouponInput('');
                showToast('Сагс өөрчлөгдсөн тул купоны хөнгөлөлтийг дахин хэрэглэнэ үү.', 'info', 4000);
            }
        }
    }, [cartSig, couponCode, setCheckoutState, showToast]);

    // ... (useEffect and handlers remain same)
    // Autofill Recipient Info from User
    useEffect(() => {
        if (user && !isAlternativeReceiver) {
            if (!recipientName && (user.name || user.email)) {
                setRecipientName(user.name || user.email || '');
            }
            if (!recipientPhone && user.phone) {
                const clean = String(user.phone).replace(/\D/g, '');
                const phoneVal = clean.startsWith('976') && clean.length > 8 ? clean.slice(3) : clean;
                setRecipientPhone(phoneVal);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, isAlternativeReceiver]);




    const handleDeleteClick = (itemId, cartType) => {
        setItemToDelete(itemId);
        setDeleteFromCart(cartType);
        setIsDeleteModalOpen(true);
    };

    const handleConfirmDelete = () => {
        if (itemToDelete && deleteFromCart) {
            if (deleteFromCart === 'ground') {
                removeFromGround(itemToDelete);
            } else {
                removeFromAir(itemToDelete);
            }
            setItemToDelete(null);
            setDeleteFromCart(null);
        }
    };

    return (
        <div className="h-full flex flex-col">
            <div className="flex-1 overflow-y-auto px-4 py-4 custom-scrollbar">
                <div className="flex flex-col gap-6">

                    {/* Shipping Rates Info Banner */}
                    {settings?.transportationRates && (
                        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm text-blue-800">
                            <div className="flex items-center gap-2 font-medium">
                                <span className="text-lg">ℹ️</span> Тээврийн үнэ (1кг):
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-1.5">
                                    <span>🚢 Газраар:</span>
                                    <span className="font-bold">{(settings.transportationRates.ground || 0).toLocaleString()}₮</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span>✈️ Агаараар:</span>
                                    <span className="font-bold">{(settings.transportationRates.air || 0).toLocaleString()}₮</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Ground Items Section */}
                    <div className="bg-white border rounded-xl p-4 shadow-sm">
                        <h2 className="text-base font-bold text-gray-900 mb-3 flex items-center justify-between border-b pb-2">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xl">🚢</span> Газраар авах ({groundItems.length})
                                {settings?.transportationRates?.ground && (
                                    <span className="text-xs text-gray-500 font-normal ml-1 bg-gray-100 px-2 py-0.5 rounded">
                                        (1кг - {(settings.transportationRates.ground || 0).toLocaleString()}₮)
                                    </span>
                                )}
                            </div>
                            <span className="text-red-600">{formatAmount(groundDetails.itemsKRW, '₩')}</span>
                        </h2>
                        <div className="space-y-3">
                            {groundItems.length > 0 ? (
                                groundItems.map((item) => (
                                    <CartItem
                                        key={item.cartItemId || item.id}
                                        item={item}
                                        updateQuantity={updateGroundQuantity}
                                        onDeleteClick={(id) => handleDeleteClick(id, 'ground')}
                                        onMoveClick={() => {
                                            moveToAir(item);
                                            showToast('Барааг агаар руу шилжүүллээ', 'success');
                                        }}
                                        MoveIcon={Plane}
                                        moveLabel="Агаараар"
                                        wonRate={wonRate}
                                        currency={currency}
                                        currencySymbol={currencySymbol}
                                        shippingType="ground"
                                        settings={settings}
                                    />
                                ))
                            ) : (
                                <div className="py-4 flex flex-col items-center justify-center text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                                    <Ship size={24} className="mb-2 opacity-50" />
                                    <span className="text-xs font-medium">Газраар авах бараа байхгүй байна</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Air Items Section */}
                    <div className="bg-white border rounded-xl p-4 shadow-sm">
                        <h2 className="text-base font-bold text-gray-900 mb-3 flex items-center justify-between border-b pb-2">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xl">✈️</span> Агаараар авах ({airItems.length})
                                {settings?.transportationRates?.air && (
                                    <span className="text-xs text-gray-500 font-normal ml-1 bg-gray-100 px-2 py-0.5 rounded">
                                        (1кг - {(settings.transportationRates.air || 0).toLocaleString()}₮)
                                    </span>
                                )}
                            </div>
                            <span className="text-red-600">{formatAmount(airDetails.itemsKRW, '₩')}</span>
                        </h2>
                        <div className="space-y-3">
                            {airItems.length > 0 ? (
                                airItems.map((item) => (
                                    <CartItem
                                        key={item.cartItemId || item.id}
                                        item={item}
                                        updateQuantity={updateAirQuantity}
                                        onDeleteClick={(id) => handleDeleteClick(id, 'air')}
                                        onMoveClick={() => {
                                            moveToGround(item);
                                            showToast('Барааг газар руу шилжүүллээ', 'success');
                                        }}
                                        MoveIcon={Ship}
                                        moveLabel="Газраар"
                                        wonRate={wonRate}
                                        currency={currency}
                                        currencySymbol={currencySymbol}
                                        shippingType="air"
                                        settings={settings}
                                    />
                                ))
                            ) : (
                                <div className="py-4 flex flex-col items-center justify-center text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                                    <Plane size={24} className="mb-2 opacity-50" />
                                    <span className="text-xs font-medium">Агаараар авах бараа байхгүй байна</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ... (Rest of component same) */}

                    {/* Restricted / prohibited items in the cart */}
                    {restrictedItems.length > 0 && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                            <div className="flex items-center gap-2 mb-1">
                                <AlertTriangle size={16} className="text-red-500 shrink-0" />
                                <span className="text-sm font-bold text-red-700">Хязгаарласан бараа</span>
                            </div>
                            <p className="text-xs text-red-600 leading-relaxed">
                                Зарим бараа агаар тээвэр/гаальд хязгаартай ({restrictedItems.map(it => it.name).slice(0, 2).join(', ')}{restrictedItems.length > 2 ? '…' : ''}). Хүргэлт удаашрах, эсвэл гаальд саатах/татгалзах эрсдэлтэй.
                            </p>
                        </div>
                    )}

                    {/* Customs warnings (3+ same item / over the duty-free value limit) */}
                    {showCustomsWarning && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                            <div className="flex items-center gap-2">
                                <AlertTriangle size={16} className="text-amber-500 shrink-0" />
                                <span className="text-sm font-bold text-amber-800">Гаалийн анхааруулга</span>
                            </div>
                            {highQtyItems.length > 0 && (
                                <p className="text-xs text-amber-700 leading-relaxed">
                                    Нэг ижил барааг <b>3-аас дээш</b> тоогоор авч байна
                                    {highQtyItems[0]?.name ? ` (${highQtyItems.map(it => it.name).slice(0, 2).join(', ')}${highQtyItems.length > 2 ? '…' : ''})` : ''}.
                                    Хувь хүн ижил барааны <b>2 хүртэлх</b> ширхэгийг татваргүй авах боломжтой. Үүнээс олон бол энэ захиалгын <b>бүх дүнд гаалийн татвар</b> ноогдож болзошгүй.
                                </p>
                            )}
                            {willSplit && (
                                <p className="text-xs text-amber-700 leading-relaxed">
                                    Барааны үнэ <b>{CUSTOMS_FREE_LIMIT_MNT.toLocaleString()}₮</b>-ийн татваргүй босгоос хэтэрсэн тул захиалга автоматаар <b>{shipmentPlan.length} илгээмж</b> болж хуваагдана. Илгээмж бүр таны нэр дээр тусдаа гаалийн мэдүүлгээр бүртгэгдэх бөгөөд тус бүр 3 саяас доош тул нэмэлт татваргүй.
                                </p>
                            )}
                            {oversizeShipments.length > 0 && (
                                <div className="text-xs text-red-600 leading-relaxed">
                                    <p>{oversizeShipments.length} барааны нэгж үнэ дангаараа 660,000₮-өөс давсан тул хуваах боломжгүй — энэ илгээмжид <b>гаалийн татвар ноогдоно</b> (арилжааны бүрдүүлэлт).</p>
                                    <button 
                                        onClick={(e) => {
                                            e.preventDefault();
                                            const chatStore = useChatStore.getState();
                                            chatStore.openChat();
                                            setTimeout(() => {
                                                chatStore.sendMessage('Оператортой чатлах (Гаалийн татвар хэтэрсэн)');
                                                setTimeout(() => {
                                                    chatStore.sendAdminMessage('Сайн байна уу? Таны барааны үнэ гаалийн татваргүй босгоос давсан байна. Танд юугаар туслах вэ?');
                                                    chatStore.requestAdmin();
                                                }, 600);
                                            }, 500);
                                        }} 
                                        className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition font-medium w-fit"
                                    >
                                        <MessageCircle size={14} /> Оператортой чатлах
                                    </button>
                                </div>
                            )}
                            <p className="flex items-start gap-1.5 text-xs text-amber-800 bg-amber-100 rounded-lg px-2 py-1.5 leading-relaxed">
                                <Lightbulb size={14} className="text-amber-600 shrink-0 mt-0.5" />
                                <span><b>Зөвлөмж:</b> Барааг <b>өөр өөр хүний нэр дээр</b> хувааж авбал хүн тус бүрд тусад нь тооцох тул татваргүй байж болно. Доорх “Өөр хүн хүлээн авна” сонголтоор хүлээн авагчийн нэрийг солино.</span>
                            </p>
                        </div>
                    )}

                    {/* Info Inputs */}
                    <div className="bg-gray-50 p-4 rounded-lg space-y-4">
                        
                        {/* Receiver Info */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-bold text-gray-900">Хүлээн авагч</h3>
                                <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        checked={isAlternativeReceiver}
                                        onChange={(e) => {
                                            const isChecked = e.target.checked;
                                            setIsAlternativeReceiver(isChecked);
                                            // Clear the register too — it belongs to the
                                            // recipient, so it must be re-entered whenever the
                                            // receiver changes (customs name↔register must match).
                                            if (isChecked) {
                                                setRecipientName('');
                                                setRecipientPhone('');
                                                setRecipientRegister('');
                                            } else {
                                                setRecipientName(user?.name || user?.email || '');
                                                const phoneVal = user?.phone ? String(user.phone).replace(/\D/g, '').replace(/^976/, '') : '';
                                                setRecipientPhone(phoneVal);
                                                setRecipientRegister('');
                                            }
                                        }}
                                        className="w-3.5 h-3.5 rounded text-costco-blue focus:ring-costco-blue border-gray-300"
                                    />
                                    Өөр хүн хүлээн авна
                                </label>
                            </div>
                            
                            <input
                                type="text"
                                value={recipientName}
                                onChange={(e) => setRecipientName(e.target.value)}
                                placeholder="Нэр"
                                className="w-full px-3 py-2 border rounded text-sm focus:ring-1 focus:ring-costco-blue outline-none"
                            />
                            <div className="flex gap-2">
                                <input
                                    type="tel"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    maxLength={15}
                                    value={recipientPhone}
                                    onChange={(e) => setRecipientPhone(e.target.value.replace(/\D/g, ''))}
                                    placeholder="Утасны дугаар"
                                    className="flex-1 px-3 py-2 border rounded text-sm focus:ring-1 focus:ring-costco-blue outline-none"
                                />
                                <input
                                    type="tel"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    maxLength={15}
                                    value={recipientPhone2}
                                    onChange={(e) => setRecipientPhone2(e.target.value.replace(/\D/g, ''))}
                                    placeholder="Нөөц дугаар"
                                    className="flex-1 px-3 py-2 border rounded text-sm focus:ring-1 focus:ring-costco-blue outline-none"
                                />
                            </div>
                            {/* Register number — needed for Mongolian customs (manifest) on
                                cross-border parcels. Optional, doesn't block checkout. */}
                            <input
                                type="text"
                                value={recipientRegister}
                                onChange={(e) => setRecipientRegister(e.target.value.toUpperCase().slice(0, 12))}
                                placeholder="Регистрийн дугаар (гаальд шаардлагатай)"
                                className="w-full px-3 py-2 border rounded text-sm focus:ring-1 focus:ring-costco-blue outline-none"
                            />
                            {registerInvalid && recipientRegister && (
                                <p className="text-[11px] text-red-500 -mt-1.5">Регистрийн формат буруу (жишээ: УБ12345678 — 2 үсэг + 8 орон).</p>
                            )}
                            {registerInvalid && !recipientRegister && (
                                <p className="text-[11px] text-amber-600 -mt-1.5">Гаалийн бүрдүүлэлтэд регистрийн дугаар заавал шаардлагатай.</p>
                            )}
                            {deliveryMode === 'pickup' && (
                                <textarea
                                    value={recipientCustomsAddress}
                                    onChange={(e) => setRecipientCustomsAddress(e.target.value)}
                                    placeholder="Хүлээн авагчийн хаяг (гаальд шаардлагатай)"
                                    rows={2}
                                    className="w-full px-3 py-2 border rounded text-sm focus:ring-1 focus:ring-costco-blue outline-none resize-none"
                                />
                            )}
                            {/* Saved addresses — one-tap fill (delivery → address+location; pickup → customs address) */}
                            {savedAddresses.length > 0 && deliveryMode !== 'korea_local' && (
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                    <span className="text-[11px] text-gray-500 w-full">Хадгалсан хаягаас сонгох:</span>
                                    {savedAddresses.map(addr => (
                                        <button
                                            key={addr.id}
                                            type="button"
                                            onClick={() => applySavedAddress(addr)}
                                            className="text-[11px] px-2 py-1 rounded-full border border-gray-200 bg-white text-gray-700 hover:border-costco-blue hover:text-costco-blue transition"
                                            title={addr.detail}
                                        >
                                            {addr.title || 'Хаяг'}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="pt-2 border-t border-gray-200 space-y-3">
                            {/* Delivery Mode Toggle */}
                            <div className="flex bg-gray-200 p-1 rounded-lg">
                                <button
                                    onClick={() => setDeliveryMode('pickup')}
                                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${deliveryMode === 'pickup'
                                        ? 'bg-white text-blue-600 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    Салбараас авах
                                </button>
                                <button
                                    onClick={() => setDeliveryMode('delivery')}
                                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${deliveryMode === 'delivery'
                                        ? 'bg-white text-blue-600 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    Хүргэлтээр авах
                                </button>
                                <button
                                    onClick={() => setDeliveryMode('korea_local')}
                                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${deliveryMode === 'korea_local'
                                        ? 'bg-white text-blue-600 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    🇰🇷 Korea Local
                                </button>
                            </div>

                            {deliveryMode === 'pickup' ? (
                                /* Branch Selection Mode */
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-gray-700 block">Салбар сонгох</label>
                                    <div className="flex gap-2">
                                        <select
                                            value={selectedBranch}
                                            onChange={(e) => setSelectedBranch(e.target.value)}
                                            className="flex-1 px-3 py-2 border rounded text-sm bg-white focus:ring-1 focus:ring-costco-blue outline-none"
                                        >
                                            <option value="">Салбар сонгоно уу...</option>
                                            <option value="main">Төв салбар</option>
                                            <option value="branch2">2-р салбар</option>
                                            <option value="branch3">3-р салбар</option>
                                        </select>
                                        <button
                                            onClick={() => {
                                                navigate('/location?mode=branch');
                                            }}
                                            className="p-2 bg-blue-50 text-blue-600 rounded border border-blue-100 hover:bg-blue-100 transition-colors"
                                            title="Газрын зураг харах"
                                        >
                                            <Map size={20} />
                                        </button>
                                    </div>
                                </div>
                            ) : deliveryMode === 'delivery' ? (
                                /* Delivery Mode */
                                <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                    {/* Location Picker */}
                                    <div>
                                        <label className="text-xs font-medium text-gray-700 block mb-1">Хүргүүлэх хаяг (Газрын зураг)</label>
                                        <button
                                            onClick={() => {
                                                navigate('/location?mode=delivery');
                                            }}
                                            className={`w-full flex items-center justify-between px-3 py-2.5 border rounded-lg text-sm transition-colors ${deliveryLocation
                                                ? 'bg-green-50 border-green-200 text-green-800'
                                                : 'bg-white border-gray-300 text-gray-500 hover:border-blue-400'
                                                }`}
                                        >
                                            <span className="flex items-center gap-2">
                                                <MapPin size={16} className={deliveryLocation ? "text-green-600" : "text-gray-400"} />
                                                {deliveryLocation
                                                    ? "Байршил сонгогдсон"
                                                    : "Газрын зураг дээр байршил сонгох"}
                                            </span>
                                            {deliveryLocation && <span className="text-xs font-bold bg-green-200 px-2 py-0.5 rounded text-green-800">OK</span>}
                                        </button>
                                    </div>
                                    {/* Additional Address Info */}
                                    <div>
                                        <label className="text-xs font-medium text-gray-700 block mb-1">Дэлгэрэнгүй хаяг / Орц, давхар</label>
                                        <textarea
                                            value={deliveryAddressInfo}
                                            onChange={(e) => setDeliveryAddressInfo(e.target.value)}
                                            placeholder="Жишээ нь: 54-р байр 2-р орц, 5 давхар, код: 1234"
                                            rows={2}
                                            className="w-full px-3 py-2 border rounded text-sm focus:ring-1 focus:ring-costco-blue outline-none resize-none mb-3"
                                        />
                                        
                                        <label className="text-xs font-medium text-gray-700 block mb-1">Хүргэлтийн нэмэлт заавар (Сонголттой)</label>
                                        <textarea
                                            value={deliveryNotes}
                                            onChange={(e) => setDeliveryNotes(e.target.value)}
                                            placeholder="Жишээ нь: Орой 18 цагаас хойш авна, эсвэл хаалганы бариулаас өлгөөд үлдээгээрэй..."
                                            rows={2}
                                            className="w-full px-3 py-2 border rounded text-sm focus:ring-1 focus:ring-costco-blue outline-none resize-none"
                                        />
                                    </div>
                                </div>
                            ) : (
                                /* Korea Local Mode */
                                <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 mb-2">
                                        <p className="text-[10px] text-blue-700 font-bold italic">
                                            ⚠️ Солонгос доторх хүргэлт: Солонгосын хаяг болон утасны дугаараа оруулна уу.
                                        </p>
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-gray-700 block mb-1">Korean Address (Солонгос хаяг)</label>
                                        <textarea
                                            value={koreaAddress}
                                            onChange={(e) => setKoreaAddress(e.target.value)}
                                            placeholder="Example: 서울특별시 강남구 테헤란로 123, 405호"
                                            rows={2}
                                            className="w-full px-3 py-2 border rounded text-sm focus:ring-1 focus:ring-costco-blue outline-none resize-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-gray-700 block mb-1">Korean Phone (Солонгос утас)</label>
                                        <input
                                            type="tel"
                                            value={koreaPhone}
                                            onChange={(e) => setKoreaPhone(e.target.value)}
                                            placeholder="010-1234-5678"
                                            className="w-full px-3 py-2 border rounded text-sm focus:ring-1 focus:ring-costco-blue outline-none"
                                        />
                                    </div>
                                </div>
                            )}

                            {deliveryMode === 'delivery' && (
                                <div className="flex justify-between items-center py-2 px-3 bg-blue-50 border border-blue-100 rounded-lg animate-in fade-in duration-300">
                                    <span className="text-xs font-bold text-blue-700">Хот доторх хүргэлтийн төлбөр:</span>
                                    <span className="text-sm font-bold text-blue-700">+{formatAmount(currentDeliveryFee, '₮')}</span>
                                </div>
                            )}
                        </div>

                        <div className="text-[10px] text-orange-600 leading-tight">
                            Монголд ирэхэд овор хэмжээ, жингээс шалтгаалж нэмэлт төлбөр гарч болзошгүй.
                        </div>
                    </div>

                    {/* Promo code */}
                    <div className="px-1 mb-3">
                        {couponCode ? (
                            <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                                <span className="text-sm text-green-700 font-bold">Купон {couponCode}: −{formatAmount(couponDiscount, '₮')}</span>
                                <button onClick={removeCoupon} className="text-xs text-gray-500 hover:text-red-500 font-bold">Хасах</button>
                            </div>
                        ) : (
                            <div className="flex gap-2">
                                <input value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} placeholder="Промо код"
                                    className="flex-1 px-3 py-2 border rounded text-sm focus:ring-1 focus:ring-costco-blue outline-none" />
                                <button onClick={applyCoupon} disabled={couponBusy || !couponInput.trim()}
                                    className="px-4 py-2 rounded text-sm font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50">
                                    {couponBusy ? '...' : 'Хэрэглэх'}
                                </button>
                            </div>
                        )}
                        {couponError && <p className="text-[11px] text-red-500 mt-1">{couponError}</p>}
                    </div>

                    {/* Order Summary Breakdown */}
                    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 space-y-2">
                        <div className="flex justify-between text-sm text-gray-700">
                            <span>Барааны нийт үнэ:</span>
                            <span className="font-bold">
                                {currency === 'MNT' ? rawTotalItemsMNT.toLocaleString() : totalItemsKRW.toLocaleString()}{currencySymbol}
                            </span>
                        </div>
                        {tierDiscountMNT > 0 && (
                            <div className="flex justify-between text-sm text-green-600 font-medium">
                                <span>Гишүүнчлэлийн хөнгөлөлт ({tier} - {discountRate}%):</span>
                                <span className="font-bold">-{tierDiscountMNT.toLocaleString()}₮</span>
                            </div>
                        )}
                        {launchBonusMNT > 0 && (
                            <div className="text-red-600">
                                <div className="flex justify-between text-sm font-medium">
                                    <span>🎉 Нээлтийн бонус ({launchPercent}%):</span>
                                    <span className="font-bold">+{launchBonusMNT.toLocaleString()}₮ оноо</span>
                                </div>
                                <p className="text-[11px] text-red-400 mt-0.5 leading-snug">
                                    Үнээс хасахгүй. Худалдан авалт баталгаажсаны дараа {launchPercent}% нь лояалти оноо болж дансанд тань ороно.
                                </p>
                            </div>
                        )}
                        <div className="flex justify-between text-sm text-gray-700">
                            <span>Тээврийн зардал (Ойролцоогоор):</span>
                            <span className="font-bold">{totalShippingMNT.toLocaleString()}₮</span>
                        </div>
                        {deliveryMode === 'delivery' && (
                            <div className="flex justify-between text-sm text-gray-700">
                                <span>Хүргэлтийн төлбөр:</span>
                                <span className="font-bold">{currentDeliveryFee.toLocaleString()}₮</span>
                            </div>
                        )}
                        {couponDiscount > 0 && (
                            <div className="flex justify-between text-sm text-green-600">
                                <span>Купон хөнгөлөлт:</span>
                                <span className="font-bold">-{couponDiscount.toLocaleString()}₮</span>
                            </div>
                        )}
                        {pointsBalanceKRW > 0 && maxRedeemKRW > 0 && (
                            <label className="flex justify-between items-center text-sm cursor-pointer bg-red-50/50 -mx-1 px-2 py-1.5 rounded-lg">
                                <span className="flex items-center gap-2 text-gray-700">
                                    <input
                                        type="checkbox"
                                        checked={redeemPoints}
                                        onChange={e => setRedeemPoints(e.target.checked)}
                                        className="w-4 h-4 accent-red-600"
                                    />
                                    🎁 Оноо ашиглах ({pointsBalanceKRW.toLocaleString()}₩ үлдэгдэл)
                                </span>
                                {pointsDiscountMNT > 0
                                    ? <span className="font-bold text-red-600">-{pointsDiscountMNT.toLocaleString()}₮</span>
                                    : <span className="text-xs text-gray-400">{maxRedeemKRW.toLocaleString()}₩ хүртэл</span>}
                            </label>
                        )}
                        <div className="border-t border-gray-200 pt-3 mt-2 flex justify-between items-center">
                            <span className="text-base font-bold text-gray-900">Нийт төлөх дүн:</span>
                            <span className="text-xl font-black text-costco-blue tracking-tight">{total.toLocaleString()}₮</span>
                        </div>
                        <div className="flex justify-between items-center mt-1">
                            <span className="text-xs text-gray-500 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                Өнөөдрийн ханш: 1₩ = {wonRate}₮
                            </span>
                            <span className="text-[11px] text-gray-400">Онлайн төлбөрт +1% шимтгэл</span>
                        </div>
                    </div>

                    {/* Brokerage consent — required for cross-border orders: the
                        customer owns the goods; we only buy & forward on their
                        behalf (consolidated-express model). Stamped on the order. */}
                    {isCrossBorder && (
                        <div className={`border rounded-xl p-3 mb-4 ${brokerageConsent ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
                            <label className="flex items-start gap-2.5 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={brokerageConsent}
                                    onChange={(e) => setBrokerageConsent(e.target.checked)}
                                    className="w-4 h-4 mt-0.5 rounded text-costco-blue focus:ring-costco-blue border-gray-300 shrink-0"
                                />
                                <span className="text-xs text-gray-700 leading-relaxed">
                                    Би энэ барааны <b>жинхэнэ эзэн</b> бөгөөд Costco.mn-ийг миний нэрийн өмнөөс, миний зардлаар худалдан авалт хийж, тээвэрлэх <b>зуучлагчаар</b> сонгож байна. Бараа миний нэр, регистр дээр гаалийн бүрдүүлэлт хийгдэхийг зөвшөөрч, <Link to="/brokerage" className="text-costco-blue underline font-bold" onClick={(e) => e.stopPropagation()}>зуучлалын гэрээний нөхцөлийг</Link> хүлээн зөвшөөрч байна.
                                </span>
                            </label>
                            {!brokerageConsent && (
                                <p className="text-[11px] text-amber-600 mt-1.5 ml-6">Захиалга өгөхийн өмнө зөвшөөрөл заавал шаардлагатай.</p>
                            )}
                        </div>
                    )}

                    {/* Payment Options Selection in Cart */}
                    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
                        <h3 className="font-bold text-gray-800 mb-3 text-sm">Төлбөрийн хэлбэр сонгох</h3>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => proceedToPayment('wire')}
                                className={`flex flex-col items-center justify-center py-2.5 rounded-xl border text-xs font-bold transition-all ${selectedPaymentMethod === 'wire' ? 'bg-costco-blue text-white border-costco-blue shadow-md' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}
                            >
                                <span className="mb-0.5">Онлайн</span>
                                <span className={`text-[9px] font-normal ${selectedPaymentMethod === 'wire' ? 'text-blue-100' : 'text-gray-400'}`}>+1% шимтгэл</span>
                            </button>
                            <button 
                                onClick={() => proceedToPayment('installment')}
                                className={`flex flex-col items-center justify-center py-2.5 rounded-xl border text-xs font-bold transition-all ${selectedPaymentMethod === 'installment' ? 'bg-costco-blue text-white border-costco-blue shadow-md' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}
                            >
                                <span className="mb-0.5 text-center leading-tight">Хуваан<br/>төлөх</span>
                            </button>
                        </div>
                    </div>

                </div>
            </div>

            <ConfirmationModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleConfirmDelete}
                title="Бараа устгах"
                message="Та энэ барааг сагснаас устгахдаа итгэлтэй байна уу?"
            />



            <ConfirmationModal
                isOpen={isWarningModalOpen}
                onClose={() => setIsWarningModalOpen(false)}
                title="Анхаарна уу"
                message="Нэг төрлийн бараанаас 2-оос дээш захиалсан тохиолдолд гаалийн татвар төлөх магадлалтайг анхаарна уу!"
            />
        </div>
    );
}
