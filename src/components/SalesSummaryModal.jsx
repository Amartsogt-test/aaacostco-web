import { useOrderStore } from '../store/orderStore';
import { useProductStore } from '../store/productStore';
import { X, ExternalLink, TrendingUp, Package, DollarSign } from 'lucide-react';

export default function SalesSummaryModal({ isOpen, onClose }) {
    const { orders } = useOrderStore();
    const { products } = useProductStore();

    if (!isOpen) return null;

    // Calculate Product Sales Stats
    const productStats = orders.reduce((acc, order) => {
        if (order.status === 'Cancelled') return acc;
        order.items.forEach(item => {
            const productInfo = products.find(p => p.name === item.name);

            // Only include if product exists in current catalog
            if (!productInfo) return;

            if (!acc[item.name]) {
                acc[item.name] = {
                    name: item.name,
                    quantity: 0,
                    revenue: 0,
                    productLink: productInfo?.url || productInfo?.costcoUrl || productInfo?.productLink || '',
                    image: productInfo?.image || ''
                };
            }
            acc[item.name].quantity += item.quantity;
            acc[item.name].revenue += item.price * item.quantity;
        });
        return acc;
    }, {});

    const productStatsArray = Object.values(productStats).sort((a, b) => b.revenue - a.revenue);

    const totalRevenue = productStatsArray.reduce((sum, item) => sum + item.revenue, 0);
    const totalItems = productStatsArray.reduce((sum, item) => sum + item.quantity, 0);

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 rounded-t-2xl">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                            Нийт борлуулагдсан барааны мэдээлэл
                        </h2>

                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition text-gray-400 hover:text-gray-600">
                        <X size={24} />
                    </button>
                </div>

                {/* Stats Summary */}
                <div className="grid grid-cols-2 gap-4 p-6 bg-white shrink-0">
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                        <div className="text-blue-600 text-sm font-bold mb-1 flex items-center gap-2">
                            <DollarSign size={16} /> Нийт Орлого
                        </div>
                        <div className="text-2xl font-bold text-gray-900">{totalRevenue.toLocaleString()}₩</div>
                    </div>
                    <div className="bg-green-50 p-4 rounded-xl border border-green-100">
                        <div className="text-green-600 text-sm font-bold mb-1 flex items-center gap-2">
                            Нийт Зарагдсан Тоо
                        </div>
                        <div className="text-2xl font-bold text-gray-900">{totalItems} ш</div>
                    </div>
                </div>

                {/* Content */}
                <div className="overflow-y-auto flex-1 p-6 pt-0">
                    <div className="border border-gray-100 rounded-xl overflow-hidden">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                                <tr>
                                    <th className="py-3 px-4 font-bold text-gray-600 text-sm">Бараа</th>
                                    <th className="py-3 px-4 font-bold text-gray-600 text-sm text-center">Тоо ширхэг</th>
                                    <th className="py-3 px-4 font-bold text-gray-600 text-sm text-center">Холбоос</th>
                                    <th className="py-3 px-4 font-bold text-gray-600 text-sm text-right">Орлого</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {productStatsArray.map((product, idx) => (
                                    <tr key={idx} className="hover:bg-blue-50/30 transition group">
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded bg-gray-100 border border-gray-200 overflow-hidden shrink-0">
                                                    {product.image && <img src={product.image} alt="" className="w-full h-full object-cover" />}
                                                </div>
                                                <span className="font-medium text-gray-900 line-clamp-2">{product.name}</span>
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 rounded border-gray-300 text-costco-blue focus:ring-costco-blue cursor-pointer"
                                                />
                                                <span className="bg-gray-100 text-gray-700 px-2.5 py-1 rounded font-bold text-xs inline-block min-w-[3rem]">
                                                    {product.quantity}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            {product.productLink ? (
                                                <a href={product.productLink} target="_blank" rel="noopener noreferrer" className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg inline-flex transition">
                                                    <ExternalLink size={18} />
                                                </a>
                                            ) : (
                                                <span className="text-gray-300">-</span>
                                            )}
                                        </td>
                                        <td className="py-3 px-4 text-right tabular-nums font-bold text-gray-800">
                                            {product.revenue.toLocaleString()}₩
                                        </td>
                                    </tr>
                                ))}
                                {productStatsArray.length === 0 && (
                                    <tr>
                                        <td colSpan="4" className="py-12 text-center text-gray-500">
                                            Борлуулалтын мэдээлэл олдсонгүй
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-white border border-gray-300 rounded-lg font-bold text-gray-700 hover:bg-gray-50 transition shadow-sm"
                    >
                        Хаах
                    </button>
                </div>
            </div>
        </div>
    );
}
