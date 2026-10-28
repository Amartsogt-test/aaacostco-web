import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { useUIStore } from '../store/uiStore';
import { ArrowLeft, Copy, CheckCircle2 } from 'lucide-react';
import { trackEvent } from '../utils/analytics';
import { apportionTotal } from '../utils/shipments';
import { orderApi } from '../services/apiClient';

export default function PaymentPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { checkoutState, groundItems, airItems, clearCart } = useCartStore();
    const { user } = useAuthStore();
    const { settings } = useSettingsStore();
    const { showToast } = useUIStore();
    const [copiedField, setCopiedField] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    // Online (wire/QPay) is the default and only standard path — it auto-confirms via
    // webhook so payment is fully automated. Manual bank transfer was removed.
    const [paymentMethod, setPaymentMethod] = useState(location.state?.paymentMethod || 'wire'); // 'wire' | 'installment'
    const [wireQR, setWireQR] = useState(null);
    const [pendingOrderId, setPendingOrderId] = useState(null); // QR shown → poll this order for payment

    // Get total amount passed from navigation state
    // We expect state: { totalValue: number }
    const totalValue = location.state?.totalValue || 0;
    const currency = location.state?.currency || 'MNT';
    const currencySymbol = currency === 'MNT' ? '₮' : '₩';

    // Only Wire payment carries a 1% service fee.
    const FEE_RATE = 0.01;
    const paymentFee = paymentMethod === 'wire' ? Math.round(totalValue * FEE_RATE) : 0;
    const amountToPay = totalValue + paymentFee;
    const amountToPayFormatted = `${amountToPay.toLocaleString()}${currencySymbol}`;

    // Bank account from Firestore settings (fallback to defaults)
    const ACCOUNT_NUMBER = settings?.bankAccountNumber || "980005005301849559";
    const ACCOUNT_NAME = settings?.bankAccountName || "Амарцогт Батбилэг";

    const copyToClipboard = (text, field) => {
        navigator.clipboard.writeText(text);
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
    };

    // Leaving the payment screen without paying: cancel the unpaid order (server no-ops
    // if it was already paid) and return to the cart, which still holds the items. Used
    // by BOTH the header back-arrow and the "Сагс руу буцах" button so they behave alike.
    const cancelAndBackToCart = async () => {
        try {
            if (pendingOrderId) await orderApi.cancelUnpaid(pendingOrderId);
        } catch { /* back out regardless */ }
        navigate('/cart-menu');
    };

    const handleConfirmPayment = async () => {
        if (isProcessing) return;
        setIsProcessing(true);

        try {
            const processedItems = location.state?.processedItems;
            const allItems = processedItems || [...groundItems.map(i => ({ ...i, shippingMethod: 'ground' })), ...airItems.map(i => ({ ...i, shippingMethod: 'air' }))];

            if (!allItems || allItems.length === 0) {
                showToast('Сагс хоосон байна.', 'warning');
                setIsProcessing(false);
                return;
            }

            // Guard against a 0-total order (e.g. opening /payment directly without
            // going through the cart, so the navigation state — and totalValue — is missing).
            if (!totalValue || totalValue <= 0) {
                showToast('Төлбөрийн дүн тодорхойгүй байна. Сагснаасаа дахин үргэлжлүүлнэ үү.', 'error');
                setIsProcessing(false);
                navigate('/cart-menu');
                return;
            }

            const {
                recipientName, recipientPhone, recipientPhone2, recipientRegister, recipientCustomsAddress,
                couponCode, couponDiscount,
                deliveryMode, selectedBranch, deliveryLocation, deliveryAddressInfo,
                deliveryNotes, isAlternativeReceiver,
                koreaAddress, koreaPhone
            } = checkoutState;

            const isGuest = !user;

            // One order line in the shape the server expects.
            const mapOrderItem = (item) => ({
                name: item?.name || 'Бараа',
                quantity: item?.quantity || 1,
                price: item?.finalPrice !== undefined ? item.finalPrice : (item?.price?.value || item?.price || 0),
                image: item?.image || '',
                id: item?.id || '',
                shippingMethod: item?.shippingMethod || 'ground',
                selectedOptions: item?.selectedOptions || null
            });

            // The order is created server-side (createOrder Cloud Function), which
            // mints a clean unique id and stamps the owning uid — so guests can check
            // out without an account and logged-in users keep their own uid. The
            // userId below is informational only; the server sets the authoritative one.
            const newOrder = {
                userId: user?.uid || '',
                customer: isGuest ? (recipientName || 'Guest') : (user.name || user.email || user.phone || 'Guest'),
                recipientName: recipientName || '',
                recipientPhone: recipientPhone || '',
                recipientPhone2: recipientPhone2 || '',
                recipientRegister: recipientRegister || '',
                // Recipient's real address for customs — pickup uses the dedicated
                // customs-address field; delivery/korea use their own address.
                recipientCustomsAddress: deliveryMode === 'pickup'
                    ? (recipientCustomsAddress || '')
                    : deliveryMode === 'delivery'
                        ? (deliveryAddressInfo || '')
                        : (koreaAddress || ''),
                // Delivery / Branch Details
                deliveryMode: deliveryMode,
                branch: deliveryMode === 'pickup' ? selectedBranch : null,
                recipientAddress: deliveryMode === 'pickup'
                    ? (selectedBranch === 'main' ? 'Төв салбар'
                        : selectedBranch === 'branch2' ? '2-р салбар'
                            : selectedBranch === 'branch3' ? '3-р салбар'
                                : 'Салбар сонгоогүй')
                    : deliveryMode === 'delivery'
                        ? `Хүргэлт: ${deliveryAddressInfo} (${deliveryLocation ? `${deliveryLocation.lat.toFixed(4)}, ${deliveryLocation.lng.toFixed(4)}` : 'Байршил сонгоогүй'})`
                        : `Korea Local: ${koreaAddress} (${koreaPhone})`,
                deliveryLocation: deliveryMode === 'delivery' ? deliveryLocation : null,
                deliveryAddressInfo: deliveryMode === 'delivery' ? deliveryAddressInfo : null,
                deliveryNotes: deliveryMode === 'delivery' ? deliveryNotes : null,
                isAlternativeReceiver: isAlternativeReceiver || false,
                koreaAddress: deliveryMode === 'korea_local' ? koreaAddress : null,
                koreaPhone: deliveryMode === 'korea_local' ? koreaPhone : null,
                deliveryFee: deliveryMode === 'delivery' ? (settings?.deliveryFee || 5000) : 0,

                groundItemsCount: groundItems.length,
                airItemsCount: airItems.length,
                items: allItems.map(mapOrderItem),
                currency: location.state?.currency || 'MNT',
                total: totalValue || 0,
                paymentMethod,                       // 'bank' | 'qpay'
                paymentFee: paymentFee,              // 1% surcharge (0 for bank)
                amountPaid: amountToPay,             // total + paymentFee
                couponCode: couponCode || '',        // applied promo code
                couponDiscount: couponDiscount || 0, // discount already reflected in total
                tierDiscount: location.state?.tierDiscount || 0,
                tierDiscountRate: location.state?.tierDiscountRate || 0,
                launchSale: !!location.state?.launchSale, // 🎉 launch bonus: earns 5% loyalty points server-side on confirm (no upfront price cut)
                pointsRedeemedKRW: location.state?.pointsRedeemedKRW || 0, // CF debits this atomically
                pointsDiscount: location.state?.pointsDiscount || 0,
                status: 'Processing',
                date: new Date().toISOString()
            };

            // Orders are created through the createOrder Cloud Function (Admin SDK):
            // it mints a clean sequential id (DDHHNN), stamps the owning uid, captures
            // the signed-in customer's email, stamps createdAt and seeds the fulfilment
            // timeline. On failure we keep the cart and surface the error.
            //
            // CONSOLIDATED EXPRESS: when the cart exceeded the duty-free cap the
            // checkout split it into several parcels (processedShipments). Each parcel
            // becomes its OWN order — its own customs declaration under the recipient's
            // name — linked by a shared shipmentGroup id. The customer still makes ONE
            // payment, so the payment fee / amountPaid / coupon live on the first order
            // only; the others carry total-only amounts (apportioned by customs value).
            const consentStamp = {
                brokerageConsent: !!location.state?.brokerageConsent,
                brokerageConsentAt: new Date().toISOString()
            };
            const shipments = (location.state?.processedShipments || [])
                .filter(s => Array.isArray(s?.items) && s.items.length > 0);

            let created;
            if (shipments.length > 1) {
                const groupId = `G${Date.now().toString(36).toUpperCase()}`;
                const totals = apportionTotal(totalValue, shipments);
                const createdIds = [];
                for (let i = 0; i < shipments.length; i++) {
                    const sItems = shipments[i].items;
                    const shipmentOrder = {
                        ...newOrder,
                        ...consentStamp,
                        items: sItems.map(mapOrderItem),
                        groundItemsCount: sItems.filter(it => (it.shippingMethod || 'ground') === 'ground').length,
                        airItemsCount: sItems.filter(it => it.shippingMethod === 'air').length,
                        total: totals[i],
                        shipmentGroup: groupId,
                        shipmentIndex: i + 1,
                        shipmentCount: shipments.length,
                        groupTotal: totalValue,
                        customsValueMNT: shipments[i].valueMNT || 0,
                        paymentFee: i === 0 ? paymentFee : 0,
                        amountPaid: i === 0 ? amountToPay : 0,
                        couponCode: i === 0 ? (couponCode || '') : '',
                        couponDiscount: i === 0 ? (couponDiscount || 0) : 0,
                        pointsRedeemedKRW: i === 0 ? (newOrder.pointsRedeemedKRW || 0) : 0,
                        pointsDiscount: i === 0 ? (newOrder.pointsDiscount || 0) : 0,
                        tierDiscount: i === 0 ? (newOrder.tierDiscount || 0) : 0,
                        deliveryFee: i === 0 ? newOrder.deliveryFee : 0,
                    };
                    const res = { data: await orderApi.create(shipmentOrder) };
                    const id = res?.data?.id;
                    if (!id) {
                        throw new Error(`Илгээмж ${i + 1}/${shipments.length} үүсгэж чадсангүй.`
                            + (createdIds.length ? ` Үүссэн илгээмж: #${createdIds.join(', #')} — админтай холбогдоно уу.` : ''));
                    }
                    createdIds.push(id);
                }
                created = { id: createdIds[0], ids: createdIds };
            } else {
                const createRes = { data: await orderApi.create({ ...newOrder, ...consentStamp }) };
                created = { id: createRes?.data?.id, userId: createRes?.data?.userId };
                if (!created.id) throw new Error('Захиалга үүсгэж чадсангүй.');
            }
            const shipmentNote = created.ids?.length > 1
                ? ` Гаалийн татваргүй босгоос хэтэрсэн тул ${created.ids.length} илгээмж болж хуваагдлаа (#${created.ids.join(', #')}).`
                : '';

            // For online (Wire) payment, KEEP the cart until payment actually succeeds —
            // otherwise backing out of the QR screen would leave an empty cart. The cart is
            // cleared in the polling success handler instead. Other methods clear now.
            if (paymentMethod !== 'wire') {
                clearCart();
                trackEvent('purchase', { transaction_id: created?.id, value: amountToPay, currency, payment_type: paymentMethod });
            }

            // Wire: create the order, then fetch a Wire invoice (URL) to pay.
            // Falls back gracefully if Wire isn't configured yet.
            if (paymentMethod === 'wire') {
                try {
                    const res = { data: await orderApi.wireCreate(created?.id, amountToPay) };
                    const qrData = res?.data?.qr;
                    if (qrData) {
                        setWireQR(qrData);
                        setPendingOrderId(created?.id);   // start polling for payment confirmation
                        setIsProcessing(false);
                        return; // Prevent redirecting, show the QR instead
                    } else {
                        throw new Error('No QR returned');
                    }
                } catch (e) {
                    console.error('Wire invoice unavailable:', e);
                    showToast('Онлайн төлбөр үүсгэхэд алдаа гарлаа.', 'error');
                    setIsProcessing(false);
                    return;
                }
            }

            if (isGuest) {
                showToast(`Захиалга амжилттай үүслээ!${shipmentNote} Бүртгэлгүй тул захиалгын түүх хадгалагдахгүйг анхаарна уу.`, 'success', 6000);
                navigate('/', { replace: true });
            } else {
                showToast(`Захиалга амжилттай үүслээ!${shipmentNote} Таны захиалгыг шалгаад баталгаажуулна.`, 'success', 6000);
                navigate('/orders', { replace: true });
            }

        } catch (error) {
            console.error("Order creation error:", error);
            showToast(`Алдаа гарлаа: ${error.message || error}`, 'error');
            setIsProcessing(false);
        }
    };

    // 🚀 Direct online checkout: when the shopper picked "Онлайн" in the cart, skip the
    // extra confirm screen here and start the payment immediately (create order + Wire
    // invoice → QR). Runs exactly once (autoStartedRef) so a re-render / StrictMode double
    // mount can't create a duplicate order. Other methods still show the review screen.
    const autoStartedRef = useRef(false);
    const autoStartWire = location.state?.paymentMethod === 'wire' && totalValue > 0;
    useEffect(() => {
        if (autoStartedRef.current) return;
        if (autoStartWire) {
            autoStartedRef.current = true;
            handleConfirmPayment();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 🔄 While the QR is shown, poll the order; once the Wire webhook marks it paid/confirmed
    // (server-side), show success and jump to the orders page automatically. (Worker path.)
    useEffect(() => {
        if (!wireQR || !pendingOrderId) return;
        let stop = false;
        const pollPhone = checkoutState?.recipientPhone || user?.phone || '';
        const check = async () => {
            try {
                const r = await orderApi.get(pendingOrderId, pollPhone);
                const stage = r?.order?.trackingStage;
                const paid = r?.order?.wire?.paid;
                // Success ONLY on real payment. 'cancelled' is also !== 'received' but must
                // NOT be treated as paid — otherwise backing out (which cancels the order)
                // would wrongly fire the success toast + redirect to /orders.
                const advanced = stage && stage !== 'received' && stage !== 'cancelled';
                if (!stop && (paid || advanced)) {
                    stop = true;
                    clearCart(); // payment confirmed → now safe to empty the cart
                    try {
                        sessionStorage.setItem('costco_last_paid_order', JSON.stringify({
                            id: pendingOrderId,
                            phone: pollPhone,
                            order: r?.order || null,
                            paidAt: new Date().toISOString(),
                        }));
                    } catch { /* ignore */ }
                    trackEvent('purchase', { transaction_id: pendingOrderId, value: amountToPay, currency, payment_type: 'wire' });
                    showToast('Төлбөр амжилттай төлөгдлөө! ✅', 'success', 5000);
                    navigate('/orders', { replace: true });
                }
            } catch { /* keep polling */ }
        };
        const iv = setInterval(check, 4000);
        const to = setTimeout(() => { stop = true; clearInterval(iv); }, 5 * 60 * 1000); // give up after 5 min
        return () => { stop = true; clearInterval(iv); clearTimeout(to); };
    }, [wireQR, pendingOrderId, checkoutState?.recipientPhone, user?.phone, navigate, showToast, clearCart, amountToPay, currency]);

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Header */}
            <div className="bg-white px-4 py-4 border-b flex items-center gap-4 sticky top-0 z-10 shadow-sm">
                <button
                    onClick={wireQR ? cancelAndBackToCart : () => navigate(-1)}
                    className="p-2 hover:bg-gray-100 rounded-full transition"
                >
                    <ArrowLeft size={24} className="text-gray-600" />
                </button>
                <h1 className="text-xl font-bold text-gray-900">Гүйлгээ хийх</h1>
            </div>

            {/* Render Wire QR Code or Normal Form */}
            {wireQR ? (
                <div className="flex-1 p-4 max-w-lg mx-auto w-full flex flex-col items-center justify-center">
                    <div className="bg-white p-8 rounded-3xl shadow-xl w-full text-center border border-gray-100">
                        <h2 className="text-xl font-bold text-gray-900 mb-2">Төлбөр төлөх</h2>
                        <p className="text-sm text-gray-500 mb-6">Банкны апп-аар QR кодыг уншуулна уу</p>
                        
                        <div className="bg-white p-3 rounded-2xl mb-6 inline-block border border-gray-100 shadow-sm">
                            <img src={wireQR.image_url} alt="QPay QR Code" className="w-72 h-72 sm:w-80 sm:h-80 object-contain" />
                        </div>
                        
                        {wireQR.deeplinks && wireQR.deeplinks.length > 0 && (
                            <>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Эсвэл апп-аар шууд нээх</p>
                                <div className="grid grid-cols-4 sm:grid-cols-5 gap-3 mb-6">
                                    {wireQR.deeplinks.map((link, idx) => (
                                        <a key={idx} href={link.link} className="flex flex-col items-center gap-1 group hover:scale-105 transition-transform">
                                            <div className="w-12 h-12 rounded-xl overflow-hidden shadow-sm border border-gray-100 bg-white p-1">
                                                <img src={link.logo} alt={link.name} className="w-full h-full object-contain" />
                                            </div>
                                            <span className="text-[9px] font-medium text-gray-600 truncate w-full text-center">{link.name}</span>
                                        </a>
                                    ))}
                                </div>
                            </>
                        )}
                        
                        {/* Live "listening for payment" indicator — the page polls the order
                            every few seconds and auto-redirects when the Wire webhook confirms. */}
                        <div className="flex items-center justify-center gap-2 mb-4 text-sm text-costco-blue font-medium">
                            <span className="w-3 h-3 border-2 border-costco-blue border-t-transparent rounded-full animate-spin" />
                            Төлбөрийг хүлээж байна... (автоматаар шалгаж байна)
                        </div>

                        <button
                            onClick={cancelAndBackToCart}
                            className="w-full py-4 text-lg rounded-xl font-bold shadow-sm bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all"
                        >
                            Сагс руу буцах
                        </button>
                    </div>
                </div>
            ) : (autoStartWire && isProcessing) ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                    <div className="w-12 h-12 border-4 border-costco-blue border-t-transparent rounded-full animate-spin mb-4"></div>
                    <p className="text-base font-bold text-gray-800">Төлбөр бэлтгэж байна...</p>
                    <p className="text-sm text-gray-500 mt-1">QPay QR кодыг үүсгэж байна, түр хүлээнэ үү.</p>
                </div>
            ) : (
                <div className="flex-1 p-4 max-w-lg mx-auto w-full flex flex-col">
                    {/* Payment method */}
                    <div className="grid grid-cols-2 gap-2 mb-4">
                        <button onClick={() => setPaymentMethod('wire')}
                            className={`py-3 rounded-xl border text-sm font-bold transition ${paymentMethod === 'wire' ? 'bg-costco-blue text-white border-costco-blue shadow-md' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                            Онлайн төлөх<br /><span className="text-[10px] font-normal opacity-80">+1% шимтгэл</span>
                        </button>
                        <button onClick={() => setPaymentMethod('installment')}
                            className={`flex flex-col items-center justify-center py-3 rounded-xl border text-sm font-bold transition ${paymentMethod === 'installment' ? 'bg-costco-blue text-white border-costco-blue shadow-md' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                            <span className="text-center leading-tight">Хуваан<br/>төлөх</span>
                        </button>
                    </div>

                    {/* Amount */}
                    <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 mb-6 shadow-sm">
                        <p className="text-sm text-blue-600 font-bold mb-2 uppercase tracking-wide">{paymentMethod === 'wire' ? 'Төлөх дүн' : 'Шилжүүлэх дүн'}</p>
                        <div className="flex items-center justify-between">
                            <span className="text-3xl font-extrabold text-costco-blue">{amountToPayFormatted}</span>
                            <button
                                onClick={() => copyToClipboard(String(amountToPay), 'amount')}
                                className="p-2 hover:bg-blue-100 rounded-xl transition text-blue-600 flex flex-col items-center gap-1 active:scale-95"
                            >
                                {copiedField === 'amount' ? <CheckCircle2 size={24} className="text-green-600" /> : <Copy size={24} />}
                                <span className="text-[10px] font-bold">{copiedField === 'amount' ? 'Хуулсан' : 'Хуулах'}</span>
                            </button>
                        </div>
                        {paymentFee > 0 && (
                            <p className="text-xs text-blue-600 mt-2">Нийт дүн: {totalValue.toLocaleString()}{currencySymbol} + Шимтгэл (1%): {paymentFee.toLocaleString()}{currencySymbol}</p>
                        )}
                    </div>

                    {/* Bank Info */}
                    {paymentMethod === 'bank' && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6 relative">
                        <div className="absolute top-0 right-0 p-3 opacity-10">
                            <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></svg>
                        </div>
                        <div className="p-4 border-b border-gray-50 bg-gray-50/50 flex justify-between items-center">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Хүлээн авах данс (Хаан банк)</p>
                            <span className="bg-green-100 text-green-700 text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider">Шилжүүлэг</span>
                        </div>

                        <div className="p-6">
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-3xl font-black text-gray-900 tracking-tighter">
                                    {ACCOUNT_NUMBER}
                                </span>
                                <button
                                    onClick={() => copyToClipboard(ACCOUNT_NUMBER, 'account')}
                                    className={`p-3 rounded-xl transition-all flex items-center justify-center ${copiedField === 'account' ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-900'} active:scale-95`}
                                >
                                    {copiedField === 'account' ? <CheckCircle2 size={24} /> : <Copy size={24} />}
                                </button>
                            </div>
                            <div className="bg-gray-50 px-4 py-2 rounded-xl inline-block border border-gray-100">
                                <p className="text-sm text-gray-600 font-bold uppercase tracking-wide">{ACCOUNT_NAME}</p>
                            </div>
                        </div>
                    </div>
                    )}

                    {/* Wire */}
                    {paymentMethod === 'wire' && (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6 p-6 text-center">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Онлайн төлөх (Wire.mn)</p>
                            <p className="text-sm text-gray-600 leading-relaxed">
                                "Онлайн төлөх" товчийг дарсны дараа QPay QR код болон банкны аппуудын сонголт гарч ирнэ.
                            </p>
                            <p className="text-xs text-amber-600 mt-2">Онлайн төлбөр сонгосон тул 1% үйлчилгээний шимтгэл нэмэгдсэн.</p>
                        </div>
                    )}

                    {/* Instruction (bank transfer only) */}
                    {paymentMethod === 'bank' ? (
                        <div className="bg-yellow-50 p-5 rounded-2xl border border-yellow-200 mb-auto text-center shadow-inner relative overflow-hidden">
                            <div className="absolute -right-4 -top-4 w-16 h-16 bg-yellow-100 rounded-full opacity-50"></div>
                            <div className="absolute -left-4 -bottom-4 w-12 h-12 bg-yellow-100 rounded-full opacity-50"></div>
                            <p className="text-sm text-yellow-800 font-medium relative z-10">
                                Гүйлгээний утга дээр утасны дугаараа бичнэ үү: <br />
                                <span className="font-black text-2xl text-costco-red mt-2 block tracking-wider bg-white py-2 rounded-xl border border-yellow-100 shadow-sm">
                                    {checkoutState.recipientPhone || ''}
                                </span>
                            </p>
                        </div>
                    ) : null}

                    {/* Instruction (installment) */}
                    {paymentMethod === 'installment' && (
                        <div className="bg-purple-50 p-5 rounded-2xl border border-purple-200 mb-auto text-center shadow-inner relative overflow-hidden mb-6">
                            <p className="text-sm text-purple-800 font-medium relative z-10 leading-relaxed">
                                Хуваан төлөх (StorePay / PocketZero) сонголт хийгдлээ. <br />
                                Та доорх товчийг дарж захиалгаа баталгаажуулна уу. Бид тантай холбогдож хуваан төлөх холбоосыг илгээх болно.
                            </p>
                        </div>
                    )}

                    {/* Confirm Button */}
                    <div className="mt-4">
                        <button
                            onClick={handleConfirmPayment}
                            disabled={isProcessing}
                            className={`w-full py-4 text-lg rounded-xl font-bold shadow-lg transition-all transform active:scale-95 flex items-center justify-center gap-2 ${isProcessing
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                : 'bg-costco-blue text-white hover:bg-blue-700 shadow-blue-200'
                                }`}
                        >
                            {isProcessing ? 'Боловсруулж байна...' : (paymentMethod === 'wire' ? 'Онлайн төлөх' : paymentMethod === 'installment' ? 'Захиалга баталгаажуулах' : 'Шилжүүлэг хийсэн')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
// Order is created server-side via the createOrder Cloud Function (Admin SDK).
