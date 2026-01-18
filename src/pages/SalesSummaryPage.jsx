import { useNavigate } from 'react-router-dom';
import { useOrderStore } from '../store/orderStore';
import { useProductStore } from '../store/productStore';
import { X, ExternalLink, TrendingUp, Package, DollarSign, ArrowLeft } from 'lucide-react';

export default function SalesSummaryPage() {
    const navigate = useNavigate();
    const { orders } = useOrderStore();
    const { products } = useProductStore();

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
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Header */}
            <div className="bg-white px-4 py-4 border-b flex items-center gap-4 sticky top-0 z-10 shadow-sm">
                <button
                    onClick={() => navigate(-1)}
                    className="p-2 hover:bg-gray-100 rounded-full transition"
                >
                    <ArrowLeft size={24} className="text-gray-600" />
                </button>
                <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <TrendingUp size={24} className="text-costco-blue" />
                    Борлуулалтын Тайлан
                </h1>
            </div>

            {/* Stats Summary */}
            <div className="p-4 bg-white grid grid-cols-2 gap-4 border-b shrink-0">
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                    <div className="text-blue-600 text-sm font-bold mb-1 flex items-center gap-2">
                        <DollarSign size={16} /> Нийт Орлого
                    </div>
                    <div className="text-2xl font-bold text-gray-900">{totalRevenue.toLocaleString()}₩</div>
                </div>
                <div className="bg-green-50 p-4 rounded-xl border border-green-100">
                    <div className="text-green-600 text-sm font-bold mb-1 flex items-center gap-2">
                        <Package size={16} /> Нийт Тоо
                    </div>
                    <div className="text-2xl font-bold text-gray-900">{totalItems} ш</div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-x-auto p-4 max-w-6xl mx-auto w-full">
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full text-left min-w-[600px]">
                        <thead className="bg-gray-50 border-b border-gray-100">
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
                                        <div className="inline-flex items-center justify-center gap-2 bg-gray-100 px-3 py-1 rounded-full text-sm font-bold text-gray-700">
                                            {product.quantity}
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
        </div>
    );
}
