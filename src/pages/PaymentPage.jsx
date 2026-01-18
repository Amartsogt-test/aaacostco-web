import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import { useAuthStore } from '../store/authStore';
import { useOrderStore } from '../store/orderStore';
import { ArrowLeft, Copy, CheckCircle2 } from 'lucide-react';

export default function PaymentPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { checkoutState, groundItems, airItems, clearCart } = useCartStore();
    const { user } = useAuthStore();
    const [copiedField, setCopiedField] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);

    // Get total amount passed from navigation state
    // We expect state: { totalAmountFormatted: string, totalValue: number }
    const totalAmountFormatted = location.state?.totalAmountFormatted || location.state?.totalAmount || "0";
    const totalValue = location.state?.totalValue || 0;

    const ACCOUNT_NUMBER = "980005005301849559";
    const ACCOUNT_NAME = "Амарцогт Батбилэг";

    const copyToClipboard = (text, field) => {
        navigator.clipboard.writeText(text);
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
    };

    const handleConfirmPayment = async () => {
        if (isProcessing) return;
        setIsProcessing(true);

        try {
            const allItems = [...groundItems.map(i => ({ ...i, shippingMethod: 'ground' })), ...airItems.map(i => ({ ...i, shippingMethod: 'air' }))];

            if (!allItems || allItems.length === 0) {
                alert("Сагс хоосон байна.");
                setIsProcessing(false);
                return;
            }

            const {
                recipientName, recipientPhone, recipientPhone2,
                deliveryMode, selectedBranch, deliveryLocation, deliveryAddressInfo
            } = checkoutState;

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
                total: totalValue || 0,
                status: 'Processing',
                date: new Date().toISOString()
            };

            const phoneForId = (user && user.phone) ? user.phone : recipientPhone;
            const phoneDigits = phoneForId ? phoneForId.replace(/\D/g, '') : '00000000';
            const cleanPhone = phoneDigits.startsWith('976') && phoneDigits.length === 11 ? phoneDigits.slice(3) : phoneDigits;

            const now = new Date();
            const timestamp = now.getDate().toString().padStart(2, '0') +
                now.getHours().toString().padStart(2, '0') +
                now.getMinutes().toString().padStart(2, '0');

            const customOrderId = `${timestamp}-${cleanPhone.slice(-4)}`;

            await useOrderStore.getState().createOrder(newOrder, customOrderId);

            clearCart();

            if (isGuest) {
                alert('Захиалга амжилттай үүслээ! Та бүртгүүлээгүй тул захиалгын түүх хадгалагдахгүйг анхаарна уу.');
                navigate('/', { replace: true });
            } else {
                alert('Захиалга амжилттай үүслээ! Таны захиалгыг шалгаад баталгаажуулах болно.');
                navigate('/orders', { replace: true });
            }

        } catch (error) {
            console.error("Order creation error:", error);
            alert(`Алдаа гарлаа: ${error.message || error} `);
            setIsProcessing(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Header */}
            <div className="bg-white px-4 py-4 border-b flex items-center gap-4 sticky top-0 z-10 shadow-sm">
                <button
                    onClick={() => navigate(-1)}
                    className="p-2 hover:bg-gray-100 rounded-full transition"
                >
                    <ArrowLeft size={24} className="text-gray-600" />
                </button>
                <h1 className="text-xl font-bold text-gray-900">Гүйлгээ хийх</h1>
            </div>

            <div className="flex-1 p-4 max-w-lg mx-auto w-full flex flex-col">
                {/* Amount */}
                <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 mb-6 shadow-sm">
                    <p className="text-sm text-blue-600 font-bold mb-2 uppercase tracking-wide">Шилжүүлэх дүн</p>
                    <div className="flex items-center justify-between">
                        <span className="text-3xl font-extrabold text-costco-blue">{totalAmountFormatted}</span>
                        <button
                            onClick={() => copyToClipboard(totalAmountFormatted?.replace(/[^\d]/g, '') || '', 'amount')}
                            className="p-2 hover:bg-blue-100 rounded-xl transition text-blue-600 flex flex-col items-center gap-1 active:scale-95"
                        >
                            {copiedField === 'amount' ? <CheckCircle2 size={24} className="text-green-600" /> : <Copy size={24} />}
                            <span className="text-[10px] font-bold">{copiedField === 'amount' ? 'Хуулсан' : 'Хуулах'}</span>
                        </button>
                    </div>
                </div>

                {/* Bank Info */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
                    <div className="p-4 border-b border-gray-50 bg-gray-50/50">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Хүлээн авах данс (Хаан банк)</p>
                    </div>

                    <div className="p-6">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-2xl font-bold text-gray-900 tracking-tight">MN&nbsp;{ACCOUNT_NUMBER}</span>
                            <button
                                onClick={() => copyToClipboard(ACCOUNT_NUMBER, 'account')}
                                className="p-2 hover:bg-gray-50 rounded-xl transition text-gray-400 hover:text-gray-600 active:scale-95"
                            >
                                {copiedField === 'account' ? <CheckCircle2 size={24} className="text-green-600" /> : <Copy size={24} />}
                            </button>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-xl inline-block">
                            <p className="text-xs text-gray-500 font-bold uppercase">{ACCOUNT_NAME}</p>
                        </div>
                    </div>
                </div>

                {/* Instruction */}
                <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-100 mb-auto text-center">
                    <p className="text-sm text-yellow-800 font-medium">
                        Гүйлгээний утга дээр <br />
                        <span className="font-bold text-lg text-costco-red my-1 block">
                            {checkoutState.recipientPhone || 'Утасны дугаараа'}
                        </span>
                        бичнэ үү.
                    </p>
                </div>

                {/* Confirm Button */}
                <div className="mt-6">
                    <button
                        onClick={handleConfirmPayment}
                        disabled={isProcessing}
                        className={`w-full py-4 text-lg rounded-xl font-bold shadow-lg transition-all transform active:scale-95 flex items-center justify-center gap-2 ${isProcessing
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'bg-costco-blue text-white hover:bg-blue-700 shadow-blue-200'
                            }`}
                    >
                        {isProcessing ? 'Боловсруулж байна...' : 'Шилжүүлэг хийсэн'}
                    </button>
                </div>
            </div>
        </div>
    );
}
