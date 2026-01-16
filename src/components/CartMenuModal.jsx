
import React, { useState } from 'react';
import { ShoppingCart, Heart, Package } from 'lucide-react';
import { useCartStore } from '../store/cartStore';
import { useWishlistStore } from '../store/wishlistStore';

import CartContent from './CartContent';
import SavedContent from './SavedContent';
import OrdersContent from './OrdersContent';

export default function CartMenuModal({ isOpen, onClose, initialTab = 'cart', isEmbedded = false }) {
    const [activeTab, setActiveTab] = useState(initialTab);
    const groundCount = useCartStore(state => state.groundItems.length);
    const airCount = useCartStore(state => state.airItems.length);
    const cartCount = groundCount + airCount;
    const savedCount = useWishlistStore(state => state.wishlist.length);

    if (!isOpen) return null;

    // Content Inner
    const Content = (
        <div className={`bg-white flex flex-col h-full shadow-sm border border-gray-100 overflow-hidden ${isEmbedded ? 'rounded-2xl w-full' : 'w-full max-w-5xl shadow-2xl sm:my-4 sm:rounded-2xl sm:h-auto sm:max-h-[calc(100vh-32px)]'}`}>
            {/* Header with Tabs */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-[#F9FAFB] shrink-0 shadow-sm relative z-10">
                <div className="flex bg-gray-100 p-1 rounded-xl flex-1 mr-3 max-w-2xl">
                    <button
                        onClick={() => setActiveTab('saved')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'saved' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        <Heart size={16} />
                        <span className="hidden sm:inline">Saved</span>
                        <span className="sm:hidden">Saved</span>
                        {savedCount > 0 && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === 'saved' ? 'bg-red-100 text-red-600' : 'bg-white text-gray-500'}`}>
                                {savedCount}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('cart')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'cart' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        <ShoppingCart size={16} />
                        <span className="hidden sm:inline">Сагс</span>
                        {cartCount > 0 && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === 'cart' ? 'bg-blue-100 text-blue-600' : 'bg-white text-gray-500'}`}>
                                {cartCount}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('orders')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'orders' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        <Package size={16} />
                        <span className="hidden sm:inline">Захиалга</span>
                        <span className="sm:hidden">Захиалга</span>
                    </button>
                </div>

                {/* Spacer */}
                <div className="flex-1 hidden sm:block"></div>


            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-hidden relative pb-[80px] sm:pb-0 bg-gray-50">
                {activeTab === 'saved' && <SavedContent />}
                {activeTab === 'cart' && <CartContent onClose={onClose} />}
                {activeTab === 'orders' && <OrdersContent />}
            </div>
        </div>
    );

    // If embedded, return just the content (no modal wrapper)
    if (isEmbedded) {
        return Content;
    }

    // Default Modal Behavior (backup)
    return (
        <div className="fixed inset-0 z-[55] bg-black/20 flex justify-center px-0 sm:px-4 animate-in fade-in duration-200">
            {Content}
        </div>
    );
}
