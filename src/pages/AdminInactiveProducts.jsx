
import React, { useState, useEffect } from 'react';
import { useProductStore } from '../store/productStore';
import { productService } from '../services/productService';
import { Eye, RotateCcw, Search, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminInactiveProducts() {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        loadInactiveProducts();
    }, []);

    const loadInactiveProducts = async () => {
        setLoading(true);
        try {
            const data = await productService.getInactiveProducts();
            setProducts(data);
        } catch (error) {
            console.error('Failed to load inactive products:', error);
            toast.error('Failed to load products');
        } finally {
            setLoading(false);
        }
    };

    const handleRestore = async (product) => {
        if (!window.confirm(`Are you sure you want to activate "${product.name}"?`)) return;

        try {
            // Update local state optimistic
            setProducts(prev => prev.filter(p => p.id !== product.id));

            // Call service
            await productService.updateStatus(product.id, 'active');
            toast.success('Product activated successfully');
        } catch (error) {
            console.error('Failed to activate:', error);
            toast.error('Failed to activate product');
            loadInactiveProducts(); // Rollback
        }
    };

    const handleDelete = async (product) => {
        if (!window.confirm(`Are you sure you want to PERMANENTLY DELETE "${product.name}"? This cannot be undone.`)) return;

        try {
            // Optimistic update
            setProducts(prev => prev.filter(p => p.id !== product.id));

            await productService.deleteProduct(product.id);
            toast.success('Product deleted permanently');

            // Also update global store if active
            const store = useProductStore.getState();
            if (store.products.find(p => p.id === product.id)) {
                store.deleteProduct(product.id);
            }
        } catch (error) {
            console.error('Failed to delete:', error);
            toast.error('Failed to delete product');
            loadInactiveProducts();
        }
    };

    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.code?.toString().includes(searchTerm)
    );

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-costco-blue"></div>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <Eye size={24} className="text-gray-400" />
                    Inactive Products
                    <span className="text-sm font-normal text-gray-500 bg-gray-100 px-2 py-1 rounded ml-2">
                        {products.length}
                    </span>
                </h1>

                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="text"
                        placeholder="Search name or code..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-costco-blue"
                    />
                </div>
            </div>

            {filteredProducts.length === 0 ? (
                <div className="text-center py-20 bg-gray-50 rounded-xl border border-dashed text-gray-500">
                    No inactive products found.
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredProducts.map(product => (
                        <div key={product.id} className="bg-white border rounded-xl p-4 flex gap-4 hover:shadow-md transition">
                            <div className="w-20 h-20 bg-gray-100 rounded-lg shrink-0 overflow-hidden">
                                {product.image ? (
                                    <img src={product.image} alt={product.name} className="w-full h-full object-cover opacity-50 grayscale" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">No Img</div>
                                )}
                            </div>

                            <div className="flex-1 min-w-0">
                                <h3 className="font-medium text-gray-900 line-clamp-2 mb-1" title={product.name}>
                                    {product.name}
                                </h3>
                                <div className="text-sm text-gray-500 mb-2">
                                    {product.code ? `Code: ${product.code}` : 'No Code'}
                                </div>

                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleRestore(product)}
                                        className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-sm font-medium hover:bg-green-100 transition"
                                    >
                                        <RotateCcw size={16} />
                                        Restore
                                    </button>
                                    <button
                                        onClick={() => handleDelete(product)}
                                        className="flex items-center justify-center px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100 transition"
                                        title="Delete Permanently"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
