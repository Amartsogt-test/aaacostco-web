import { Package, Truck, CheckCircle, Clock, XCircle } from 'lucide-react';

const ORDER_STATUSES = [
    { key: 'Processing', label: 'Хүлээн авсан', icon: Clock, color: 'text-blue-500 bg-blue-50' },
    { key: 'Confirmed', label: 'Баталгаажсан', icon: Package, color: 'text-indigo-500 bg-indigo-50' },
    { key: 'Shipped', label: 'Ачигдсан', icon: Truck, color: 'text-orange-500 bg-orange-50' },
    { key: 'Хүргэлтэнд', label: 'Хүргэлтэнд', icon: Truck, color: 'text-amber-500 bg-amber-50' },
    { key: 'Хүргэгдсэн', label: 'Хүргэгдсэн', icon: CheckCircle, color: 'text-green-500 bg-green-50' }
];

const CANCELLED = { key: 'Cancelled', label: 'Цуцлагдсан', icon: XCircle, color: 'text-red-500 bg-red-50' };

function getStatusIndex(status) {
    return ORDER_STATUSES.findIndex(s => s.key === status);
}

export default function OrderTracking({ order }) {
    if (!order) return null;

    const isCancelled = order.status === 'Cancelled';
    const currentIndex = getStatusIndex(order.status);

    if (isCancelled) {
        return (
            <div className="bg-red-50 rounded-xl p-4 border border-red-100">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                        <XCircle size={20} className="text-red-500" />
                    </div>
                    <div>
                        <p className="font-bold text-red-700">Захиалга цуцлагдсан</p>
                        <p className="text-sm text-red-500">
                            {order.cancelledAt ? new Date(order.cancelledAt).toLocaleDateString('mn-MN') : ''}
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl p-4 border border-gray-100">
            <h4 className="text-sm font-bold text-gray-900 mb-4">Захиалгын явц</h4>

            <div className="relative">
                {/* Progress line */}
                <div className="absolute left-5 top-5 bottom-5 w-0.5 bg-gray-200" />
                <div
                    className="absolute left-5 top-5 w-0.5 bg-gradient-to-b from-green-400 to-blue-400 transition-all duration-500"
                    style={{
                        height: currentIndex >= 0
                            ? `${(currentIndex / (ORDER_STATUSES.length - 1)) * 100}%`
                            : '0%',
                        maxHeight: 'calc(100% - 40px)'
                    }}
                />

                {/* Steps */}
                <div className="space-y-4">
                    {ORDER_STATUSES.map((step, index) => {
                        const isCompleted = index <= currentIndex;
                        const isCurrent = index === currentIndex;
                        const Icon = step.icon;

                        return (
                            <div key={step.key} className="flex items-center gap-3 relative">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center z-10 transition-all duration-300 ${isCompleted
                                    ? step.color
                                    : 'bg-gray-100 text-gray-300'
                                    } ${isCurrent ? 'ring-2 ring-offset-2 ring-blue-300 scale-110' : ''}`}
                                >
                                    <Icon size={18} />
                                </div>
                                <div className="flex-1">
                                    <p className={`text-sm font-bold ${isCompleted ? 'text-gray-900' : 'text-gray-400'}`}>
                                        {step.label}
                                    </p>
                                    {isCurrent && (
                                        <p className="text-xs text-blue-500 font-medium animate-pulse">
                                            Одоогийн төлөв
                                        </p>
                                    )}
                                </div>
                                {isCompleted && !isCurrent && (
                                    <CheckCircle size={16} className="text-green-400" />
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
