
import React, { useState, useEffect, Suspense } from 'react';
import { Trash2, Plus, Minus, ArrowRight, MapPin } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useUIStore } from '../store/uiStore';
import { useProductStore } from '../store/productStore';
import { useCartStore } from '../store/cartStore';

import PaymentModal from '../components/PaymentModal';
import ConfirmationModal from '../components/ConfirmationModal';
// import LoginModal from '../components/LoginModal';
const LoginModal = React.lazy(() => import('../components/LoginModal'));
import { useAuthStore } from '../store/authStore';
import { useOrderStore } from '../store/orderStore';

export default function CartContent({ onClose }) {
    const [isPaymentOpen, setIsPaymentOpen] = useState(false);
    const [isLoginOpen, setIsLoginOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isWarningModalOpen, setIsWarningModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState(null);

    const [shippingMethod, setShippingMethod] = useState('ground');
    const [recipientName, setRecipientName] = useState('');
    const [recipientPhone, setRecipientPhone] = useState('');
    const [selectedBranch, setSelectedBranch] = useState('');

    const { items, updateQuantity, removeFromCart, totalPrice } = useCartStore();
    const { currency } = useUIStore();
    const { wonRate } = useProductStore();
    const { user } = useAuthStore();
    const navigate = useNavigate();
    const totalKRW = totalPrice();
    const total = currency === 'MNT' ? Math.round(totalKRW * wonRate) : totalKRW;
    const currencySymbol = currency === 'MNT' ? '₮' : '₩';

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
        try {
            if (!items || items.length === 0) {
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
                recipientAddress: `${selectedBranch === 'main' ? 'Төв салбар' : selectedBranch === 'branch2' ? '2-р салбар' : '3-р салбар'} (${shippingMethod === 'ground' ? 'Газраар' : 'Агаараар'})`,
                branch: selectedBranch || '',
                shippingMethod: shippingMethod || '',
                items: items.map(item => ({
                    name: item?.name || 'Бараа',
                    quantity: item?.quantity || 1,
                    price: item?.price || 0,
                    image: item?.image || '',
                    id: item?.id || ''
                })),
                total: total || 0,
                status: 'Processing',
                date: new Date().toISOString()
            };

            const phoneForId = (user && user.phone) ? user.phone : recipientPhone;
            const phoneDigits = phoneForId.replace(/\D/g, '');
            const cleanPhone = phoneDigits.startsWith('976') && phoneDigits.length === 11 ? phoneDigits.slice(3) : phoneDigits;

            const now = new Date();
            const timestamp = now.getDate().toString().padStart(2, '0') +
                now.getHours().toString().padStart(2, '0') +
                now.getMinutes().toString().padStart(2, '0');

            const customOrderId = `${timestamp}-${cleanPhone.slice(-4)}`;

            await useOrderStore.getState().createOrder(newOrder, customOrderId);

            useCartStore.getState().clearCart();
            setIsPaymentOpen(false);

            if (onClose) onClose(); // Close the modal

            if (isGuest) {
                alert('Захиалга амжилттай үүслээ! Та бүртгүүлээгүй тул захиалгын түүх хадгалагдахгүйг анхаарна уу.');
                navigate('/');
            } else {
                alert('Захиалга амжилттай үүслээ! Таны захиалгыг шалгаад баталгаажуулах болно.');
                navigate('/orders');
            }
        } catch (error) {
            console.error("Order creation error:", error);
            alert(`Алдаа гарлаа: ${error.message || error}`);
        }
    };

    if (items.length === 0) {
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
                    <h2 className="text-lg font-bold text-gray-900">Сагс ({items.length})</h2>
                    {/* Cart Items */}
                    <div className="space-y-4">
                        {items.map((item) => (
                            <div key={item.id} className="bg-white p-3 rounded-lg border border-gray-100 flex gap-3">
                                <div className="w-20 h-20 bg-white flex-shrink-0 border rounded overflow-hidden p-1">
                                    <img src={item.image} alt={item.name} className="w-full h-full object-contain" />
                                </div>

                                <div className="flex-1 flex flex-col justify-between">
                                    <div className="flex justify-between gap-2">
                                        <div className="min-w-0">
                                            <h3 className="font-bold text-gray-900 line-clamp-2 text-sm leading-tight mb-1">{item.name}</h3>
                                            {item.selectedOptions && Object.entries(item.selectedOptions).map(([key, value], idx) => (
                                                <p key={idx} className="text-[10px] text-blue-600 font-medium">
                                                    • {value === '무향' ? 'Үнэргүй' : value === '라벤더' ? 'Лаванда' : value}
                                                </p>
                                            ))}
                                        </div>
                                        <p className="font-bold text-sm text-gray-900 whitespace-nowrap">
                                            {currency === 'MNT'
                                                ? Math.round((item.price * item.quantity) * wonRate).toLocaleString()
                                                : (item.price * item.quantity).toLocaleString()
                                            }{currencySymbol}
                                        </p>
                                    </div>

                                    <div className="flex items-center justify-end mt-2">
                                        <div className="flex items-center border rounded-lg h-8">
                                            <button
                                                onClick={() => {
                                                    if (item.quantity === 1) {
                                                        setItemToDelete(item.id);
                                                        setIsDeleteModalOpen(true);
                                                    } else {
                                                        updateQuantity(item.id, item.quantity - 1);
                                                    }
                                                }}
                                                className="px-2 hover:bg-gray-50 text-gray-600 disabled:opacity-50 h-full flex items-center"
                                            >
                                                <Minus size={14} />
                                            </button>
                                            <span className="w-8 text-center font-medium text-sm">{item.quantity}</span>
                                            <button
                                                onClick={() => {
                                                    if (item.quantity === 2) {
                                                        setIsWarningModalOpen(true);
                                                    }
                                                    updateQuantity(item.id, item.quantity + 1);
                                                }}
                                                className="px-2 hover:bg-gray-50 text-gray-600 h-full flex items-center"
                                            >
                                                <Plus size={14} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

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
                                placeholder="Утас (8 оронтой)"
                                className="w-full px-3 py-2 border rounded text-sm focus:ring-1 focus:ring-costco-blue outline-none"
                            />
                        </div>

                        <div className="pt-2 border-t border-gray-200 space-y-2">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-600">Хүргэлт</span>
                                <div className="flex gap-3 text-xs">
                                    <label className="flex items-center gap-1 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="shipping"
                                            value="ground"
                                            checked={shippingMethod === 'ground'}
                                            onChange={() => setShippingMethod('ground')}
                                            className="text-costco-blue"
                                        />
                                        <span>Газар</span>
                                    </label>
                                    <label className="flex items-center gap-1 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="shipping"
                                            value="air"
                                            checked={shippingMethod === 'air'}
                                            onChange={() => setShippingMethod('air')}
                                            className="text-costco-blue"
                                        />
                                        <span>Агаар</span>
                                    </label>
                                </div>
                            </div>
                            <select
                                value={selectedBranch}
                                onChange={(e) => setSelectedBranch(e.target.value)}
                                className="w-full px-3 py-2 border rounded text-sm bg-white"
                            >
                                <option value="">Салбар сонгоно уу...</option>
                                <option value="main">Төв салбар</option>
                                <option value="branch2">2-р салбар</option>
                                <option value="branch3">3-р салбар</option>
                            </select>
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
                totalAmount={`${total.toLocaleString()}${currencySymbol}`}
                recipientPhone={recipientPhone}
                onConfirm={handleConfirmOrder}
            />

            <Suspense fallback={null}>
                {isLoginOpen && (
                    <LoginModal
                        isOpen={isLoginOpen}
                        onClose={() => setIsLoginOpen(false)}
                        onSuccess={() => setIsPaymentOpen(true)}
                    />
                )}
            </Suspense>

            <ConfirmationModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={() => {
                    if (itemToDelete) {
                        removeFromCart(itemToDelete);
                        setItemToDelete(null);
                    }
                }}
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
