import React, { useState, useEffect } from 'react';
import { useOrderStore } from '../store/orderStore';
import { useProductStore } from '../store/productStore';
import { Package, Search, Filter, CheckCircle, XCircle, ExternalLink, Crown, ChevronLeft } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';

export default function AdminOrders() {
    const { orders, updateOrderStatus, fetchOrders } = useOrderStore();
    const { products, fetchProducts } = useProductStore();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const isSummaryMode = searchParams.get('view') === 'summary';

    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('All');
    const [expandedOrder, setExpandedOrder] = useState(null);

    // Fetch products and orders on mount
    useEffect(() => {
        fetchProducts();
        fetchOrders();
    }, [fetchProducts, fetchOrders]);



    const getFilteredOrders = () => {
        // Create set of valid product names for efficient lookup
        const validProductNames = new Set(products.map(p => p.name));

        return orders.filter(order => {
            // Filter out orders where NONE of the items exist in current catalog (Legacy/Test data cleanup)
            const hasValidItems = order.items.some(item => validProductNames.has(item.name));
            if (!hasValidItems) return false;

            const matchesSearch = order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                order.customer.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesStatus = filterStatus === 'All' || order.status === filterStatus;
            return matchesSearch && matchesStatus;
        });
    };

    const filteredOrders = getFilteredOrders();

    // Calculate Product Sales Stats
    const productStats = orders.reduce((acc, order) => {
        if (order.status === 'Cancelled' || order.status === 'Processing') return acc;
        order.items.forEach(item => {
            if (!acc[item.name]) {
                // Find current product info to get the link
                const productInfo = products.find(p => p.name === item.name);
                acc[item.name] = {
                    name: item.name,
                    quantity: 0,
                    revenue: 0,
                    productLink: productInfo?.url || productInfo?.costcoUrl || productInfo?.productLink || ''
                };
            }
            acc[item.name].quantity += item.quantity;
            acc[item.name].revenue += item.price * item.quantity;
        });
        return acc;
    }, {});


    const productStatsArray = Object.values(productStats).sort((a, b) => b.revenue - a.revenue);

    const stats = {
        totalOrders: orders.length,
        totalRevenue: orders.reduce((acc, order) => acc + (order.status !== 'Cancelled' && order.status !== 'Processing' ? order.total : 0), 0),
        pendingOrders: orders.filter(o => o.status === 'Processing').length
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'Delivered': return 'bg-green-100 text-green-700';
            case 'Processing': return 'bg-blue-100 text-blue-700';
            case 'Shipped': return 'bg-purple-100 text-purple-700';
            case 'Cancelled': return 'bg-red-100 text-red-700';
            default: return 'bg-gray-100 text-gray-700';
        }
    };


    return (
        <div className={`min-h-screen bg-gray-50 ${isSummaryMode ? 'py-4' : 'py-8'} px-4`}>
            <div className={`mx-auto transition-all duration-300 ${isSummaryMode ? 'w-full px-2' : 'container max-w-6xl'}`}>
                {/* Main Orders List - Hidden in Summary Mode */}
                {!isSummaryMode && (
                    <>

                        <div className="flex items-center gap-4 mb-6">
                            <button
                                onClick={() => navigate('/admin')}
                                className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
                                title="Буцах"
                            >
                                <ChevronLeft size={24} />
                            </button>
                            <h1 className="text-2xl font-bold text-gray-900">Захиалгын удирдлага</h1>
                        </div>
                        <div className="flex flex-col md:flex-row gap-4 mb-6 justify-between items-center">
                            <div className="relative w-full md:w-96">
                                <input
                                    type="text"
                                    placeholder="Захиалгын дугаар, Хэрэглэгчийн нэр..."
                                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-costco-blue focus:border-transparent outline-none"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            </div>
                            <div className="flex items-center gap-2 w-full md:w-auto">
                                <Filter size={18} className="text-gray-400" />
                                <select
                                    className="bg-white border border-gray-200 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-costco-blue"
                                    value={filterStatus}
                                    onChange={(e) => setFilterStatus(e.target.value)}
                                >
                                    <option value="All">Бүгд</option>
                                    <option value="Processing">Processing</option>
                                    <option value="Shipped">Shipped</option>
                                    <option value="Delivered">Delivered</option>
                                    <option value="Cancelled">Cancelled</option>
                                </select>
                            </div>
                        </div>

                        {/* Orders Table */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-gray-200 border-b border-gray-100">
                                        <tr>
                                            <th className="py-3 px-4 font-bold text-gray-600 text-sm">Нийт захиалга: {stats.totalOrders}</th>

                                            <th className="py-3 px-4 font-bold text-gray-600 text-sm">Хэрэглэгч</th>
                                            <th className="py-3 px-4 font-bold text-gray-600 text-sm">{stats.totalRevenue.toLocaleString()}₩</th>
                                            <th className="py-3 px-4 font-bold text-gray-600 text-sm">Төлөв</th>

                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {filteredOrders.map(order => (
                                            <React.Fragment key={order.id}>
                                                <tr className="hover:bg-gray-50 transition cursor-pointer" onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}>
                                                    <td className="py-4 px-6 font-medium text-gray-900">
                                                        <div className="flex flex-col">
                                                            <span className="text-gray-900">{order.id}</span>
                                                            <span className="text-xs text-gray-400">
                                                                {new Date(order.date).toLocaleString('sv-SE', {
                                                                    year: 'numeric',
                                                                    month: '2-digit',
                                                                    day: '2-digit',
                                                                    hour: '2-digit',
                                                                    minute: '2-digit',
                                                                    second: '2-digit',
                                                                    hour12: false
                                                                }).replace(' ', ' ')}
                                                            </span>
                                                        </div>
                                                    </td>

                                                    <td className="py-4 px-6 text-gray-900">
                                                        <div className="flex items-center gap-2">
                                                            {(order.customer && (order.customer.includes('facebook.com') || order.customer.startsWith('http'))) ? (
                                                                <a href={order.customer} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                                                                    <ExternalLink size={14} />
                                                                    {order.customer.replace('https://www.facebook.com/', '').replace('profile.php?id=', '')}
                                                                </a>
                                                            ) : (
                                                                <span className="text-gray-900">{order.customer || 'Guest'}</span>
                                                            )}
                                                            {(() => {
                                                                // Calculate User Tier based on Phone history
                                                                const phone = order.recipientPhone;
                                                                if (!phone) return null;

                                                                // Clean phone for matching (simple digits only)
                                                                const cleanPhone = phone.replace(/\D/g, '');

                                                                // Find all orders for this user
                                                                const userTotalSpend = orders.reduce((sum, o) => {
                                                                    const oPhone = o.recipientPhone ? o.recipientPhone.replace(/\D/g, '') : '';
                                                                    if (oPhone === cleanPhone && o.status !== 'Cancelled') {
                                                                        return sum + (o.total || 0);
                                                                    }
                                                                    return sum;
                                                                }, 0);

                                                                let tierColor = 'text-orange-400'; // Default Member
                                                                let tierName = 'Member';

                                                                if (userTotalSpend >= 10000000) {
                                                                    tierColor = 'text-gray-600';
                                                                    tierName = 'Platinum';
                                                                } else if (userTotalSpend >= 5000000) {
                                                                    tierColor = 'text-yellow-500';
                                                                    tierName = 'Gold';
                                                                }

                                                                return (
                                                                    <div className={`${tierColor}`} title={`${tierName}: ${userTotalSpend.toLocaleString()}₩`}>
                                                                        <Crown size={16} fill="currentColor" />
                                                                    </div>
                                                                );
                                                            })()}
                                                        </div>
                                                    </td>
                                                    <td className="py-4 px-6 tabular-nums text-gray-600">{order.total.toLocaleString()}₩</td>
                                                    <td className="py-4 px-6">
                                                        {order.status === 'Processing' ? (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (confirm('Захиалгыг баталгаажуулж, илгээх үү?')) {
                                                                        updateOrderStatus(order.id, 'Shipped');
                                                                    }
                                                                }}
                                                                className="w-8 h-8 flex items-center justify-center bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition border border-blue-200"
                                                                title="Баталгаажуулах"
                                                            >
                                                                <CheckCircle size={16} />
                                                            </button>
                                                        ) : order.status === 'Shipped' ? (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (confirm('Баталгаажуулалтыг цуцлах уу? (Буцаад Processing төлөвт шилжинэ)')) {
                                                                        updateOrderStatus(order.id, 'Processing');
                                                                    }
                                                                }}
                                                                className="w-8 h-8 flex items-center justify-center bg-green-50 text-green-600 rounded-full border border-green-200 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition"
                                                                title="Баталгаажуулалтыг цуцлах"
                                                            >
                                                                <CheckCircle size={16} />
                                                            </button>
                                                        ) : (
                                                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${getStatusColor(order.status)}`}>
                                                                {order.status}
                                                            </span>
                                                        )}
                                                    </td>

                                                </tr>
                                                {/* Expanded Row Details */}
                                                {expandedOrder === order.id && (
                                                    <tr className="bg-gray-50/50">
                                                        <td colSpan="6" className="p-6">
                                                            <div className="bg-white rounded-lg border border-gray-100 p-4">
                                                                <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                                                                    <Package size={16} />
                                                                    Барааны жагсаалт
                                                                </h4>
                                                                <div className="divide-y divide-gray-100 mb-4">
                                                                    {order.items.map((item, idx) => {
                                                                        const productInfo = products.find(p => p.name === item.name);
                                                                        const productLink = productInfo?.url || productInfo?.costcoUrl || productInfo?.productLink || '';

                                                                        return (
                                                                            <div key={idx} className="py-2 flex justify-between text-sm items-center">
                                                                                <div className="text-gray-600 flex items-center gap-2">
                                                                                    <span className="font-medium text-gray-900">{item.name}</span>
                                                                                    <span className="text-gray-400">x{item.quantity}</span>
                                                                                    {productLink && (
                                                                                        <a
                                                                                            href={productLink}
                                                                                            target="_blank"
                                                                                            rel="noopener noreferrer"
                                                                                            className="text-blue-500 hover:text-blue-700 p-1 hover:bg-blue-50 rounded"
                                                                                            title="Барааны линк руу үсрэх"
                                                                                            onClick={(e) => e.stopPropagation()}
                                                                                        >
                                                                                            <ExternalLink size={14} />
                                                                                        </a>
                                                                                    )}
                                                                                </div>
                                                                                <div className="tabular-nums text-gray-700">{(item.price * item.quantity).toLocaleString()}₩</div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>

                                                                <div className="mb-4 p-3 bg-gray-50 rounded border border-gray-100 text-sm">
                                                                    <p className="font-bold text-gray-900 mb-1">Хүргэлтийн мэдээлэл:</p>
                                                                    <div className="grid grid-cols-2 gap-2 text-gray-600">
                                                                        <div>Нэр: <span className="font-medium text-gray-900">{order.recipientName || '-'}</span></div>
                                                                        <div>Утас: <span className="font-medium text-gray-900">{order.recipientPhone || '-'}</span></div>
                                                                        <div className="col-span-2">Хаяг: <span className="font-medium text-gray-900">{order.recipientAddress || '-'}</span></div>
                                                                    </div>
                                                                </div>

                                                                <div className="flex items-center justify-between border-t border-gray-100 pt-4">
                                                                    <div className="flex gap-2">
                                                                        <select
                                                                            className="text-sm border border-gray-200 rounded px-2 py-1 outline-none focus:border-costco-blue"
                                                                            value={order.status}
                                                                            onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                                                                        >
                                                                            <option value="Processing">Processing</option>
                                                                            <option value="Shipped">Shipped</option>
                                                                            <option value="Delivered">Delivered</option>
                                                                            <option value="Cancelled">Cancelled</option>
                                                                        </select>
                                                                    </div>
                                                                    <div className="font-bold text-lg text-gray-900">
                                                                        Нийт: {order.total.toLocaleString()}₩
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        ))}
                                    </tbody>
                                </table>
                                {filteredOrders.length === 0 && (
                                    <div className="text-center py-12 text-gray-500">
                                        Захиалга олдсонгүй.
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}



            </div>
        </div>
    );
}
