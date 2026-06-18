import { Clock, ShoppingBag, Plane, MapPin, CheckCircle } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useOrderStore } from '../store/orderStore';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import OrderTracking from './OrderTracking';
import { formatMoney, formatDate } from '../utils/format';
import { STAGE_GROUPS, getStageGroup, getCurrentStage, getStageDef } from '../utils/orderTracking';
import { callFunction } from '../firebase';

// Quick-filter groups (Temu-style), shown at the top of the orders view —
// including inside the Cart hub's "Захиалга" tab. Each maps to a set of pipeline
// stages (see src/utils/orderTracking.js).
const GROUP_ICONS = {
    pending: Clock,
    prep: ShoppingBag,
    transit: Plane,
    delivery: MapPin,
    done: CheckCircle,
};

export default function OrdersContent() {
    const { user, isAuthenticated } = useAuthStore();
    const { orders, fetchUserOrders, isLoading } = useOrderStore();
    const [searchParams, setSearchParams] = useSearchParams();
    const [expandedId, setExpandedId] = useState(null); // expand a past order to show its timeline

    useEffect(() => {
        if (isAuthenticated && user?.uid) {
            fetchUserOrders(user.uid, user.phone);
        }
    }, [isAuthenticated, user?.uid, user?.phone, fetchUserOrders]);

    if (!isAuthenticated) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <p className="text-gray-500 mb-4">Та захиалгын түүхээ харахын тулд нэвтрэх шаардлагатай.</p>
                <Link to="/login" className="text-costco-blue font-bold hover:underline">Нэвтрэх</Link>
            </div>
        );
    }

    const userOrders = [...orders].sort((a, b) => new Date(b.date) - new Date(a.date));

    // Optional group filter (set by the status bar below, or /orders?status=<group>).
    const groupFilter = searchParams.get('status');
    const displayedOrders = groupFilter ? userOrders.filter(o => getStageGroup(o) === groupFilter) : userOrders;

    // Toggle a group filter IN PLACE, preserving other params (e.g. the cart hub's ?tab).
    const toggleGroup = (key) => {
        const next = new URLSearchParams(searchParams);
        if (groupFilter === key) next.delete('status');
        else next.set('status', key);
        setSearchParams(next);
    };
    const countFor = (key) => userOrders.filter(o => getStageGroup(o) === key).length;

    // Show the active-order tracking when no specific group is being viewed:
    // the most recent order that is neither delivered nor cancelled.
    const activeOrder = !groupFilter && userOrders.find(order => {
        const s = getCurrentStage(order);
        return s !== 'delivered' && s !== 'cancelled';
    });

    // Customer-initiated return request (written server-side — see requestReturn).
    const requestReturn = async (orderId) => {
        const reason = window.prompt('Буцаалтын шалтгаанаа бичнэ үү:');
        if (reason === null) return;
        try {
            await callFunction('requestReturn', { orderId, reason: reason || '' });
            alert('Буцаалтын хүсэлт илгээгдлээ. Бид тантай холбогдоно.');
            if (user?.uid) fetchUserOrders(user.uid, user.phone);
        } catch (e) {
            alert(e?.message || 'Хүсэлт илгээхэд алдаа гарлаа.');
        }
    };

    return (
        <div className="h-full overflow-y-auto p-4 custom-scrollbar bg-gray-50">
            <h2 className="text-xl font-bold text-gray-900 mb-3">Миний захиалгууд</h2>

            {/* Status quick-filter bar — tap a group to filter the list in place. */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-2 mb-4 grid grid-cols-5 gap-1">
                {STAGE_GROUPS.map(({ key, label }) => {
                    const Icon = GROUP_ICONS[key] || Clock;
                    const count = countFor(key);
                    const active = groupFilter === key;
                    return (
                        <button
                            key={key}
                            onClick={() => toggleGroup(key)}
                            aria-pressed={active}
                            className={`flex flex-col items-center text-center gap-1 py-1.5 rounded-xl transition ${active ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                        >
                            <div className="relative">
                                <Icon size={24} strokeWidth={1.5} className={active ? 'text-costco-blue' : 'text-gray-700'} />
                                {count > 0 && (
                                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 flex items-center justify-center bg-costco-red text-white text-[10px] font-bold rounded-full">
                                        {count}
                                    </span>
                                )}
                            </div>
                            <span className={`text-[10px] leading-tight ${active ? 'text-costco-blue font-semibold' : 'text-gray-600'}`}>{label}</span>
                        </button>
                    );
                })}
            </div>

            {isLoading && (
                <div className="flex justify-center py-8">
                    <div className="w-8 h-8 border-4 border-costco-blue border-t-transparent rounded-full animate-spin"></div>
                </div>
            )}

            {/* Active Order with Tracking Timeline */}
            {activeOrder && (
                <div className="mb-6">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-bold text-gray-700">#{activeOrder.id}</span>
                        <span className="text-xs text-gray-500">{formatDate(activeOrder.date)}</span>
                    </div>
                    <OrderTracking order={activeOrder} />
                    {activeOrder.total ? (
                        <div className="text-sm font-bold text-right mt-2 text-gray-900">
                            {formatMoney(activeOrder.total, activeOrder.currency === 'MNT' ? '₮' : '₩')}
                        </div>
                    ) : null}
                </div>
            )}

            {/* Order History */}
            <div className="space-y-3 pb-20">
                {!isLoading && displayedOrders.length > 0 ? (
                    displayedOrders.map(order => {
                        const stageKey = getCurrentStage(order);
                        const stageLabel = (getStageDef(stageKey) || {}).label || order.status;
                        const badgeClass = stageKey === 'delivered'
                            ? 'bg-green-50 text-green-600'
                            : stageKey === 'cancelled'
                                ? 'bg-red-50 text-red-600'
                                : 'bg-blue-50 text-blue-600';
                        const isOpen = expandedId === order.id;
                        return (
                            <div key={order.id} className="bg-white rounded-lg border shadow-sm overflow-hidden">
                                <button
                                    onClick={() => setExpandedId(isOpen ? null : order.id)}
                                    className="w-full text-left p-3 hover:bg-gray-50 transition"
                                >
                                    <div className="flex justify-between mb-2">
                                        <span className="font-bold text-sm text-gray-700">#{order.id}</span>
                                        <span className={`text-xs px-2 py-0.5 rounded ${badgeClass}`}>
                                            {stageLabel}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-sm text-gray-500">
                                        <span>{formatDate(order.date)}</span>
                                        <span className="font-medium text-gray-900">
                                            {formatMoney(order.total, order.currency === 'MNT' ? '₮' : '₩', '—')}
                                        </span>
                                    </div>
                                </button>
                                {isOpen && (
                                    <div className="px-3 pb-3 border-t border-gray-100 pt-3 space-y-2">
                                        <OrderTracking order={order} />
                                        {order.returnRequest ? (
                                            <div className="text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-amber-700">
                                                Буцаалтын хүсэлт: {order.returnRequest.status === 'resolved' ? 'Шийдвэрлэгдсэн' : 'Хүлээгдэж байна'}{order.returnRequest.reason ? ` — ${order.returnRequest.reason}` : ''}
                                            </div>
                                        ) : getCurrentStage(order) === 'delivered' ? (
                                            <button onClick={() => requestReturn(order.id)} className="text-xs font-bold text-costco-blue border border-costco-blue rounded-lg px-3 py-1.5 hover:bg-blue-50">
                                                Буцаалт хүсэх
                                            </button>
                                        ) : null}
                                    </div>
                                )}
                            </div>
                        );
                    })
                ) : !isLoading ? (
                    <div className="text-center text-gray-500 py-10">
                        {groupFilter ? 'Энэ ангилалд захиалга байхгүй байна.' : 'Захиалга байхгүй байна.'}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
