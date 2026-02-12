
import { Package, CheckCircle, Truck, MapPin, Clock } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useOrderStore } from '../store/orderStore';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import OrderTracking from './OrderTracking';

export default function OrdersContent() {
    const { user, isAuthenticated } = useAuthStore();
    const { orders, fetchUserOrders, isLoading } = useOrderStore();

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
    const activeOrder = userOrders.find(order =>
        ['Processing', 'Confirmed', 'Shipped', 'Хүргэлтэнд'].includes(order.status)
    );

    return (
        <div className="h-full overflow-y-auto p-4 custom-scrollbar bg-gray-50">
            <h2 className="text-xl font-bold text-gray-900 mb-4 sticky top-0 bg-gray-50 z-10 py-2">Миний захиалгууд</h2>

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
                        <span className="text-xs text-gray-500">
                            {new Date(activeOrder.date).toLocaleDateString('mn-MN')}
                        </span>
                    </div>
                    <OrderTracking order={activeOrder} />
                    {activeOrder.total && (
                        <div className="text-sm font-bold text-right mt-2 text-gray-900">
                            {activeOrder.total.toLocaleString()}₩
                        </div>
                    )}
                </div>
            )}

            {/* Order History */}
            <div className="space-y-3 pb-20">
                {!isLoading && userOrders.length > 0 ? (
                    userOrders.map(order => (
                        <div key={order.id} className="bg-white p-3 rounded-lg border shadow-sm">
                            <div className="flex justify-between mb-2">
                                <span className="font-bold text-sm text-gray-700">#{order.id}</span>
                                <span className={`text-xs px-2 py-0.5 rounded ${order.status === 'Хүргэгдсэн' ? 'bg-green-50 text-green-600'
                                    : order.status === 'Cancelled' ? 'bg-red-50 text-red-600'
                                        : 'bg-blue-50 text-blue-600'
                                    }`}>
                                    {order.status}
                                </span>
                            </div>
                            <div className="flex justify-between text-sm text-gray-500">
                                <span>{new Date(order.date).toLocaleDateString('mn-MN')}</span>
                                <span className="font-medium text-gray-900">
                                    {order.total ? order.total.toLocaleString() : '—'}₩
                                </span>
                            </div>
                        </div>
                    ))
                ) : !isLoading ? (
                    <div className="text-center text-gray-500 py-10">
                        Захиалга байхгүй байна.
                    </div>
                ) : null}
            </div>
        </div>
    );
}
