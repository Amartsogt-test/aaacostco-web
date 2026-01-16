import React, { useState, useEffect, Suspense } from 'react';
import { Plus, Minus, Trash2, ShoppingCart, ChevronDown, ChevronUp, MapPin, Map, Plane, Ship, ArrowRight } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import { useProductStore } from '../store/productStore';
import { useUIStore } from '../store/uiStore';
import { useAuthStore } from '../store/authStore';
import { useOrderStore } from '../store/orderStore';
import { useSettingsStore } from '../store/settingsStore';
import { calculateFinalPrice } from '../utils/productUtils';
import PaymentModal from './PaymentModal';
import ConfirmationModal from './ConfirmationModal';
import LocationPickerModal from './LocationPickerModal';

// Updated Cart Item Component
// eslint-disable-next-line no-unused-vars
function CartItem({ item, updateQuantity, onDeleteClick, onMoveClick, MoveIcon, moveLabel, wonRate, currency, currencySymbol, shippingType, settings }) {
    // Calculate the final price including shipping based on shipping type
    const basePriceKRW = item.price?.value || item.price || 0;
    const unitPriceMNT = calculateFinalPrice(item, basePriceKRW, settings?.transportationRates, wonRate, shippingType);
    const totalPriceMNT = unitPriceMNT * item.quantity;

    // For KRW display, we need to reverse the MNT calculation to get shipping-inclusive KRW
    // unitPriceMNT = (basePriceKRW + shippingCostKRW) * wonRate
    // So shippingInclusiveKRW = unitPriceMNT / wonRate
    const unitPriceKRW = wonRate > 0 ? Math.round(unitPriceMNT / wonRate) : basePriceKRW;
    const totalPriceKRW = unitPriceKRW * item.quantity;

    return (
        <div className="bg-white p-3 rounded-lg border border-gray-100 flex gap-3 group">
            <Link to={`/product/${item.id}`} className="w-20 h-20 bg-white flex-shrink-0 border rounded overflow-hidden p-1 relative cursor-pointer hover:border-blue-300 transition-colors">
                <img src={item.image} alt={item.name} className="w-full h-full object-contain" loading="lazy" />
            </Link>

            <div className="flex-1 flex flex-col justify-between">
                <div className="flex justify-between gap-2">
                    <div className="min-w-0">
                        <h3 className="font-bold text-gray-900 line-clamp-2 text-sm leading-tight mb-1">{item.name}</h3>
                        {/* Options display */}
                        {item.selectedOptions && Object.entries(item.selectedOptions).map(([, value], idx) => (
                            <p key={idx} className="text-[10px] text-blue-600 font-medium">
                                • {value === '무향' ? 'Үнэргүй' : value === '라벤더' ? 'Лаванда' : value}
                            </p>
                        ))}
                    </div>
                    <p className="font-bold text-sm text-gray-900 whitespace-nowrap">
                        {currency === 'MNT'
                            ? totalPriceMNT.toLocaleString()
                            : totalPriceKRW.toLocaleString()
                        }{currencySymbol}
                    </p>
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
                        >
                            <Minus size={14} />
                        </button>
                        <span className="w-8 text-center font-medium text-sm">{item.quantity}</span>
                        <button
                            onClick={() => updateQuantity(item.cartItemId || item.id, item.quantity + 1)}
                            className="px-2 hover:bg-gray-50 text-gray-600 h-full flex items-center"
                        >
                            <Plus size={14} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function CartContent({ onClose }) {
    // ... (state remains same)
    const [isPaymentOpen, setIsPaymentOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isWarningModalOpen, setIsWarningModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [deleteFromCart, setDeleteFromCart] = useState(null); // 'ground' or 'air'

    const [recipientName, setRecipientName] = useState('');
    const [recipientPhone, setRecipientPhone] = useState('');
    const [recipientPhone2, setRecipientPhone2] = useState('');

    // Delivery & Branch State
    const [deliveryMode, setDeliveryMode] = useState('pickup'); // 'pickup' | 'delivery'
    const [selectedBranch, setSelectedBranch] = useState('');
    const [isMapOpen, setIsMapOpen] = useState(false);
    const [mapMode, setMapMode] = useState('branch'); // 'branch' | 'delivery'
    const [deliveryLocation, setDeliveryLocation] = useState(null);
    const [deliveryAddressInfo, setDeliveryAddressInfo] = useState('');

    // Dual cart system
    const {
        groundItems,
        airItems,
        updateGroundQuantity,
        updateAirQuantity,
        removeFromGround,
        removeFromAir,
        moveToAir,
        moveToGround,
        clearCart
    } = useCartStore();

    // ... (rest of logic same until render)
    const { currency, showToast } = useUIStore();
    const { wonRate } = useProductStore();
    const { user } = useAuthStore();
    const { settings } = useSettingsStore();
    const navigate = useNavigate();

    // Calculate shipping-inclusive subtotals for each section
    const calculateSectionTotal = (items, shippingType) => {
        return items.reduce((sum, item) => {
            const basePriceKRW = item.price?.value || item.price || 0;
            const unitPriceMNT = calculateFinalPrice(item, basePriceKRW, settings?.transportationRates, wonRate, shippingType);
            return sum + (unitPriceMNT * item.quantity);
        }, 0);
    };

    const groundTotalMNT = calculateSectionTotal(groundItems, 'ground');
    const airTotalMNT = calculateSectionTotal(airItems, 'air');
    const grandTotalMNT = groundTotalMNT + airTotalMNT;

    // For KRW display, reverse the calculation
    const groundTotalKRW = wonRate > 0 ? Math.round(groundTotalMNT / wonRate) : 0;
    const airTotalKRW = wonRate > 0 ? Math.round(airTotalMNT / wonRate) : 0;
    const grandTotalKRW = groundTotalKRW + airTotalKRW;

    const currencySymbol = currency === 'MNT' ? '₮' : '₩';
    const groundTotal = currency === 'MNT' ? groundTotalMNT : groundTotalKRW;
    const airTotal = currency === 'MNT' ? airTotalMNT : airTotalKRW;
    const totalWithoutDelivery = currency === 'MNT' ? grandTotalMNT : grandTotalKRW;

    // Delivery Fee logic
    const deliveryFeeMNT = deliveryMode === 'delivery' ? 5000 : 0;
    const deliveryFeeKRW = wonRate > 0 ? Math.round(deliveryFeeMNT / wonRate) : 0;
    const currentDeliveryFee = currency === 'MNT' ? deliveryFeeMNT : deliveryFeeKRW;

    const total = totalWithoutDelivery + currentDeliveryFee;

    const totalItemCount = groundItems.length + airItems.length;

    // ... (useEffect and handlers remain same)
    // Autofill Recipient Info from User
    useEffect(() => {
        if (user) {
            if (!recipientName && (user.name || user.email)) {
                setRecipientName(user.name || user.email || '');
            }
            if (!recipientPhone && user.phone) {
                const clean = user.phone.replace(/\D/g, '');
                const phoneVal = clean.startsWith('976') && clean.length > 8 ? clean.slice(3) : clean;
                setRecipientPhone(phoneVal);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    const handleConfirmOrder = async () => {
        // ... (same as original, verify moveToAir/Ground doesn't break this)
        try {
            const allItems = [...groundItems.map(i => ({ ...i, shippingMethod: 'ground' })), ...airItems.map(i => ({ ...i, shippingMethod: 'air' }))];

            if (!allItems || allItems.length === 0) {
                alert("Сагс хоосон байна.");
                return;
            }

            const isGuest = !user;
            const guestId = `guest-${new Date().getTime()}`;

            const newOrder = {
                userId: isGuest ? guestId : (user.uid || ''),
                customer: isGuest ? (recipientName || 'Guest') : (user.name || user.email || user.phone || 'Guest'),
                recipientName: recipientName || '',
                recipientPhone: recipientPhone || '',
                recipientPhone2: recipientPhone2 || '',
                // Delivery / Branch Details
                deliveryMode: deliveryMode,
                branch: deliveryMode === 'pickup' ? selectedBranch : null,
                recipientAddress: deliveryMode === 'pickup'
                    ? `${selectedBranch === 'main' ? 'Төв салбар' : selectedBranch === 'branch2' ? '2-р салбар' : '3-р салбар'} `
                    : `Хүргэлт: ${deliveryAddressInfo} (${deliveryLocation ? `${deliveryLocation.lat.toFixed(4)}, ${deliveryLocation.lng.toFixed(4)}` : 'Байршил сонгоогүй'})`,
                deliveryLocation: deliveryMode === 'delivery' ? deliveryLocation : null,
                deliveryAddressInfo: deliveryMode === 'delivery' ? deliveryAddressInfo : null,
                deliveryFee: deliveryMode === 'delivery' ? 5000 : 0,

                groundItemsCount: groundItems.length,
                airItemsCount: airItems.length,
                items: allItems.map(item => ({
                    name: item?.name || 'Бараа',
                    quantity: item?.quantity || 1,
                    price: item?.price?.value || item?.price || 0,
                    image: item?.image || '',
                    id: item?.id || '',
                    shippingMethod: item?.shippingMethod || 'ground'
                })),
                total: total || 0,
                status: 'Processing',
                date: new Date().toISOString()
            };

            // ... (rest of order logic)
            const phoneForId = (user && user.phone) ? user.phone : recipientPhone;
            const phoneDigits = phoneForId.replace(/\D/g, '');
            const cleanPhone = phoneDigits.startsWith('976') && phoneDigits.length === 11 ? phoneDigits.slice(3) : phoneDigits;

            const now = new Date();
            const timestamp = now.getDate().toString().padStart(2, '0') +
                now.getHours().toString().padStart(2, '0') +
                now.getMinutes().toString().padStart(2, '0');

            const customOrderId = `${timestamp}-${cleanPhone.slice(-4)}`;

            await useOrderStore.getState().createOrder(newOrder, customOrderId);

            clearCart();
            setIsPaymentOpen(false);

            if (onClose) onClose();

            if (isGuest) {
                alert('Захиалга амжилттай үүслээ! Та бүртгүүлээгүй тул захиалгын түүх хадгалагдахгүйг анхаарна уу.');
                navigate('/');
            } else {
                alert('Захиалга амжилттай үүслээ! Таны захиалгыг шалгаад баталгаажуулах болно.');
                navigate('/orders');
            }
        } catch (error) {
            console.error("Order creation error:", error);
            alert(`Алдаа гарлаа: ${error.message || error} `);
        }
    };


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

    if (totalItemCount === 0) {
        // ... (Empty state logic same)
        return (
            <div className="flex flex-col items-center justify-center p-8 text-center h-full">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                </div>
                <h2 className="text-lg font-bold text-gray-800 mb-2">Таны сагс хоосон байна</h2>
                <p className="text-gray-500 mb-6 text-sm">Та хүссэн бараагаа сагсандаа хийгээрэй.</p>
                <Link
                    to="/"
                    onClick={onClose}
                    className="inline-block bg-costco-blue text-white px-6 py-2.5 rounded font-medium hover:bg-blue-700 transition text-sm"
                >
                    Худалдан авалт хийх
                </Link>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            <div className="flex-1 overflow-y-auto px-4 py-4 custom-scrollbar">
                <div className="flex flex-col gap-6">

                    {/* Ground Items Section */}
                    {groundItems.length > 0 && (
                        <div>
                            <h2 className="text-base font-bold text-gray-900 mb-3 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-xl">🚢</span> Газраар авах ({groundItems.length})
                                </div>
                                <span className="text-red-600">{groundTotal.toLocaleString()}{currencySymbol}</span>
                            </h2>
                            <div className="space-y-3">
                                {groundItems.map((item) => (
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
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Air Items Section */}
                    {airItems.length > 0 && (
                        <div>
                            <h2 className="text-base font-bold text-gray-900 mb-3 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-xl">✈️</span> Агаараар авах ({airItems.length})
                                </div>
                                <span className="text-red-600">{airTotal.toLocaleString()}{currencySymbol}</span>
                            </h2>
                            <div className="space-y-3">
                                {airItems.map((item) => (
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
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ... (Rest of component same) */}
                    {/* Info Inputs */}
                    <div className="bg-gray-50 p-4 rounded-lg space-y-4">
                        <h3 className="text-sm font-bold text-gray-900">Хүлээн авагч</h3>
                        <div className="space-y-3">
                            <input
                                type="text"
                                value={recipientName}
                                onChange={(e) => setRecipientName(e.target.value)}
                                placeholder="Нэр"
                                className="w-full px-3 py-2 border rounded text-sm focus:ring-1 focus:ring-costco-blue outline-none"
                            />
                            <input
                                type="tel"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={8}
                                value={recipientPhone}
                                onChange={(e) => setRecipientPhone(e.target.value.replace(/\D/g, ''))}
                                placeholder="Утасны дугаар 1 (8 оронтой)"
                                className="w-full px-3 py-2 border rounded text-sm focus:ring-1 focus:ring-costco-blue outline-none"
                            />
                            <input
                                type="tel"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={8}
                                value={recipientPhone2}
                                onChange={(e) => setRecipientPhone2(e.target.value.replace(/\D/g, ''))}
                                placeholder="Утасны дугаар 2 (8 оронтой)"
                                className="w-full px-3 py-2 border rounded text-sm focus:ring-1 focus:ring-costco-blue outline-none"
                            />
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
                                                setMapMode('branch');
                                                setIsMapOpen(true);
                                            }}
                                            className="p-2 bg-blue-50 text-blue-600 rounded border border-blue-100 hover:bg-blue-100 transition-colors"
                                            title="Газрын зураг харах"
                                        >
                                            <Map size={20} />
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                /* Delivery Mode */
                                <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                    {/* Location Picker */}
                                    <div>
                                        <label className="text-xs font-medium text-gray-700 block mb-1">Хүргүүлэх хаяг (Газрын зураг)</label>
                                        <button
                                            onClick={() => {
                                                setMapMode('delivery');
                                                setIsMapOpen(true);
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
                                            className="w-full px-3 py-2 border rounded text-sm focus:ring-1 focus:ring-costco-blue outline-none resize-none"
                                        />
                                    </div>
                                </div>
                            )}

                            {deliveryMode === 'delivery' && (
                                <div className="flex justify-between items-center py-2 px-3 bg-blue-50 border border-blue-100 rounded-lg animate-in fade-in duration-300">
                                    <span className="text-xs font-bold text-blue-700">Хот доторх хүргэлтийн төлбөр:</span>
                                    <span className="text-sm font-bold text-blue-700">+{currentDeliveryFee.toLocaleString()}{currencySymbol}</span>
                                </div>
                            )}
                        </div>

                        <div className="text-[10px] text-orange-600 leading-tight">
                            Монголд ирэхэд овор хэмжээ, жингээс шалтгаалж нэмэлт төлбөр гарч болзошгүй.
                        </div>
                    </div>

                    {/* Integrated Payment Button */}
                    <div className="pt-2 pb-8">
                        <button
                            onClick={() => setIsPaymentOpen(true)}
                            disabled={!recipientName || recipientPhone.length < 8}
                            className={`w-full py-3 rounded-xl font-bold transition flex items-center justify-center gap-2 text-sm ${(!recipientName || recipientPhone.length < 8) ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'}`}
                        >
                            Нийт {total.toLocaleString()}{currencySymbol} төлөх
                            <ArrowRight size={16} />
                        </button>
                    </div>
                </div>
            </div>

            <PaymentModal
                isOpen={isPaymentOpen}
                onClose={() => setIsPaymentOpen(false)}
                totalAmount={`${total.toLocaleString()}${currencySymbol} `}
                recipientPhone={recipientPhone}
                recipientPhone2={recipientPhone2}
                onConfirm={handleConfirmOrder}
            />

            <ConfirmationModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleConfirmDelete}
                title="Бараа устгах"
                message="Та энэ барааг сагснаас устгахдаа итгэлтэй байна уу?"
            />

            <LocationPickerModal
                isOpen={isMapOpen}
                onClose={() => setIsMapOpen(false)}
                mode={mapMode}
                initialLocation={deliveryLocation}
                selectedBranchId={selectedBranch}
                onSelect={(result) => {
                    if (mapMode === 'branch') {
                        setSelectedBranch(result);
                    } else {
                        setDeliveryLocation(result);
                    }
                    setIsMapOpen(false);
                }}
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
