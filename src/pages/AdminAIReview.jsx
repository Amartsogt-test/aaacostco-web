
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { productService } from '../services/productService';
import {
    AlertCircle,
    Scale,
    Languages,
    FileText,
    ChevronLeft,
    ExternalLink,
    RefreshCw
} from 'lucide-react';

const AdminAIReview = () => {
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const [activeTab, setActiveTab] = useState('weights'); // weights | translations | descriptions
    const [data, setData] = useState({ weights: [], translations: [], descriptions: [] });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await productService.getAIReviewItems();
            setData(res);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    if (!user?.isAdmin) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <p className="text-gray-500">Access Denied</p>
            </div>
        );
    }

    const renderList = (items, type) => {
        if (items.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                        <span className="text-2xl">✅</span>
                    </div>
                    <p>No issues found in this category.</p>
                </div>
            );
        }

        return (
            <div className="space-y-2">
                {items.map(product => (
                    <div key={product.id} className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between hover:border-blue-300 transition-colors">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-mono text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
                                    {product.id}
                                </span>
                                {type === 'weights' && (
                                    <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full uppercase tracking-wide">
                                        Weight: {product.weight || 0}kg
                                    </span>
                                )}
                            </div>
                            <h3 className="font-medium text-gray-900 truncate pr-4">
                                {product.name_mn || product.name}
                            </h3>
                            {type === 'translations' && (
                                <p className="text-xs text-gray-500 truncate mt-0.5">
                                    Original: {product.englishName || product.name}
                                </p>
                            )}
                        </div>

                        <button
                            onClick={() => window.open(`/product/${product.id}`, '_blank')}
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="View Product"
                        >
                            <ExternalLink size={18} />
                        </button>
                    </div>
                ))}
            </div>
        );
    };

    // Tab color map (Tailwind JIT requires full class names)
    const TAB_COLORS = {
        orange: 'border-orange-500 text-orange-600 bg-orange-50',
        blue: 'border-blue-500 text-blue-600 bg-blue-50',
        purple: 'border-purple-500 text-purple-600 bg-purple-50',
    };

    // Tab Button Helper
    // eslint-disable-next-line no-unused-vars
    const TabBtn = ({ id, icon: Icon, label, count, colorClass }) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`flex-1 py-3 px-2 flex flex-col items-center justify-center gap-1.5 border-b-2 transition-colors ${activeTab === id
                ? TAB_COLORS[colorClass] || TAB_COLORS.blue
                : 'border-transparent text-gray-500 hover:bg-gray-50'
                }`}
        >
            <div className="relative">
                <Icon size={20} />
                {count > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full px-1">
                        {count > 99 ? '99+' : count}
                    </span>
                )}
            </div>
            <span className="text-xs font-bold uppercase tracking-wide">{label}</span>
        </button>
    );

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            {/* Header */}
            <div className="bg-white sticky top-0 z-10 border-b border-gray-100 px-4 py-3 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate('/admin')}
                        className="w-10 h-10 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <ChevronLeft size={24} />
                    </button>
                    <h1 className="text-lg font-black text-gray-900">
                        AI Review Center
                    </h1>
                </div>
                <button
                    onClick={fetchData}
                    disabled={loading}
                    className={`p-2 rounded-full ${loading ? 'animate-spin text-gray-400' : 'text-blue-600 hover:bg-blue-50'}`}
                >
                    <RefreshCw size={20} />
                </button>
            </div>

            {/* Tabs */}
            <div className="bg-white border-b border-gray-100 flex">
                <TabBtn
                    id="weights"
                    icon={Scale}
                    label="Weights"
                    count={data.weights.length}
                    colorClass="orange" // Tailwind color name
                />
                <TabBtn
                    id="translations"
                    icon={Languages}
                    label="Translations"
                    count={data.translations.length}
                    colorClass="blue"
                />
                <TabBtn
                    id="descriptions"
                    icon={FileText}
                    label="Descriptions"
                    count={data.descriptions.length}
                    colorClass="purple"
                />
            </div>

            {/* Content */}
            <div className="max-w-3xl mx-auto p-4">
                {loading ? (
                    <div className="py-20 flex justify-center">
                        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                ) : (
                    <>
                        <div className="mb-4 flex items-center gap-2 text-sm text-gray-500 px-1">
                            <AlertCircle size={16} />
                            <span>Found <b>{data[activeTab].length}</b> items needing review.</span>
                        </div>
                        {renderList(data[activeTab], activeTab)}
                    </>
                )}
            </div>
        </div>
    );
};

export default AdminAIReview;
