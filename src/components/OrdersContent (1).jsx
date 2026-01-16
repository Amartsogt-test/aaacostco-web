
import { Package, CheckCircle, Truck, MapPin, Clock } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useOrderStore } from '../store/orderStore';
import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';

export default function OrdersContent() {
    const { user, isAuthenticated } = useAuthStore();
    const { orders, fetchOrders } = useOrderStore();

    useEffect(() => {
        if (isAuthenticated) {
            fetchOrders();
        }
    }, [isAuthenticated, fetchOrders]);

    if (!isAuthenticated) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <p className="text-gray-500 mb-4">Та захиалгын түүхээ харахын тулд нэвтрэх шаардлагатай.</p>
                {/* We can't trigger login modal easily from here without props, so maybe just show message */}
            </div>
        );
    }

    const userDigits = user?.phone ? user.phone.replace(/\D/g, '') : '';
    const cleanUserPhone = userDigits.startsWith('976') && userDigits.length === 11 ? userDigits.slice(3) : userDigits;

    const userOrders = orders.filter(order => {
        if (order.userId && user?.uid && order.userId === user.uid) return true;
        const orderPhone = order.recipientPhone ? order.recipientPhone.toString().replace(/\D/g, '') : '';
        return orderPhone === cleanUserPhone || orderPhone === userDigits || order.recipientPhone === user?.phone;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));

    const activeOrder = userOrders.find(order => ['Processing', 'Shipped'].includes(order.status));

    const steps = [
        { label: 'Баталгаажсан', icon: CheckCircle },
        { label: 'Бэлтгэгдэж байна', icon: Package },
        { label: 'Хүргэлтэнд', icon: Truck },
        { label: 'Хүргэгдсэн', icon: MapPin },
    ];

    const getStepStatus = (label, orderStatus) => {
        // Simplified status tracking for the small modal view
        const statusMap = { 'Confirmed': 1, 'Processing': 2, 'Shipped': 3, 'Delivered': 4 };
        const stepMap = { 'Баталгаажсан': 1, 'Бэлтгэгдэж байна': 2, 'Хүргэлтэнд': 3, 'Хүргэгдсэн': 4 };

        const current = statusMap[orderStatus] || 0;
        const step = stepMap[label] || 0;

        if (step < current) return 'done';
        if (step === current) return 'current';
        return 'upcoming';
    };

    return (
        <div className="h-full overflow-y-auto p-4 custom-scrollbar bg-gray-50">
            <h2 className="text-xl font-bold text-gray-900 mb-4 sticky top-0 bg-gray-50 z-10 py-2">Миний захиалгууд</h2>

            {activeOrder && (
                <div className="bg-white rounded-lg shadow-sm p-4 mb-6 border border-blue-100">
                    <div className="flex justify-between items-start mb-3">
                        <div>
                            <h3 className="font-bold text-gray-800 text-sm">Идэвхтэй захиалга</h3>
                            <p className="text-xs text-gray-500">{new Date(activeOrder.date).toLocaleDateString()}</p>
                        </div>
                        <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-1 rounded">
                            {activeOrder.status}
                        </span>
                    </div>

                    <div className="flex items-center justify-between mb-4 px-1">
                        {steps.map((step, idx) => {
                            const st = getStepStatus(step.label, activeOrder.status);
                            const colorClass = st === 'done' ? 'text-green-500' : st === 'current' ? 'text-blue-500' : 'text-gray-300';
                            return (
                                <div key={idx} className="flex flex-col items-center">
                                    <step.icon size={16} className={`${colorClass} mb-1`} />
                                    {/* Hide label on small screens if needed, or keep it tiny */}
                                </div>
                            );
                        })}
                    </div>
                    <div className="text-sm font-bold text-right">
                        {activeOrder.total.toLocaleString()}₩
                    </div>
                </div>
            )}

            <div className="space-y-3 pb-20">
                {userOrders.length > 0 ? (
                    userOrders.map(order => (
                        <div key={order.id} className="bg-white p-3 rounded-lg border shadow-sm">
                            <div className="flex justify-between mb-2">
                                <span className="font-bold text-sm text-gray-700">#{order.id}</span>
                                <span className={`text-xs px-2 py-0.5 rounded ${order.status === 'Delivered' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-600'}`}>
                                    {order.status}
                                </span>
                            </div>
                            <div className="flex justify-between text-sm text-gray-500">
                                <span>{new Date(order.date).toLocaleDateString()}</span>
                                <span className="font-medium text-gray-900">{order.total.toLocaleString()}₩</span>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="text-center text-gray-500 py-10">
                        Захиалга байхгүй байна.
                    </div>
                )}
            </div>
        </div>
    );
}
