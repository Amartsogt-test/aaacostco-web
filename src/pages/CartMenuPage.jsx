import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ShoppingCart, Heart, Package, ArrowLeft } from 'lucide-react';
import { useCartStore } from '../store/cartStore';
import { useWishlistStore } from '../store/wishlistStore';

import CartContent from '../components/CartContent';
import SavedContent from '../components/SavedContent';
import OrdersContent from '../components/OrdersContent';

export default function CartMenuPage() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const initialTab = searchParams.get('tab') || 'cart';
    const [activeTab, setActiveTab] = useState(initialTab);

    const groundCount = useCartStore(state => state.groundItems.length);
    const airCount = useCartStore(state => state.airItems.length);
    const cartCount = groundCount + airCount;
    const savedCount = useWishlistStore(state => state.wishlist.length);

    const handleTabChange = (tab) => {
        setActiveTab(tab);
        setSearchParams({ tab });
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Header */}
            <div className="bg-white px-2 sm:px-4 py-3 border-b flex items-center justify-between sticky top-0 z-20 shadow-sm gap-2 sm:gap-0">
                <div className="flex items-center gap-4 shrink-0">
                    <button onClick={() => navigate(-1)} className="p-1 -ml-1 sm:hidden text-gray-600">
                        <ArrowLeft size={24} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex bg-gray-100 p-1 rounded-xl flex-1 w-full sm:w-auto sm:max-w-md mx-auto">
                    <button
                        onClick={() => handleTabChange('saved')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'saved' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        <Heart size={16} />
                        <span className="hidden sm:inline">Хадгалсан</span>
                        <span className="sm:hidden text-xs">Хадгалсан</span>
                        {savedCount > 0 && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === 'saved' ? 'bg-red-100 text-red-600' : 'bg-white text-gray-500'}`}>
                                {savedCount}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => handleTabChange('cart')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'cart' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        <ShoppingCart size={16} />
                        <span className="hidden sm:inline">Сагс</span>
                        <span className="sm:hidden text-xs">Сагс</span>
                        {cartCount > 0 && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === 'cart' ? 'bg-blue-100 text-blue-600' : 'bg-white text-gray-500'}`}>
                                {cartCount}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => handleTabChange('orders')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'orders' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        <Package size={16} />
                        <span className="hidden sm:inline">Захиалга</span>
                        <span className="sm:hidden text-xs">Захиалга</span>
                    </button>
                </div>

                {/* Spacer removed to allow more space */}
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-hidden relative bg-gray-50 flex flex-col">
                {activeTab === 'saved' && <SavedContent />}
                {activeTab === 'cart' && <CartContent />}
                {activeTab === 'orders' && <OrdersContent />}
            </div>
        </div>
    );
}
