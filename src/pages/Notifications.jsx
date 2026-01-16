import { useSaleAlertStore } from '../store/saleAlertStore';
import { useProductStore } from '../store/productStore';
import { useCartStore } from '../store/cartStore';
import { Link } from 'react-router-dom';
import { Bell, Trash2, ShoppingCart } from 'lucide-react';
import { useUIStore } from '../store/uiStore';

export default function Notifications() {
    const { alerts, removeAlert } = useSaleAlertStore();
    const { products, wonRate } = useProductStore();
    const { addToCart } = useCartStore();
    const { currency, showToast } = useUIStore();

    const alertProducts = products.filter(p => alerts.includes(p.id));

    return (
        <div className="container mx-auto px-4 py-8 pb-24">
            <h1 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-3">
                <Bell className="text-costco-red" />
                Хямдрал хүлээх жагсаалт
                <span className="bg-gray-100 text-gray-600 text-sm px-2 py-1 rounded-full">{alertProducts.length}</span>
            </h1>

            {alertProducts.length === 0 ? (
                <div className="text-center py-20 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                    <Bell className="mx-auto text-gray-300 mb-4" size={48} />
                    <p className="text-gray-500 font-medium">Танд одоогоор хямдрал хүлээсэн бараа байхгүй байна.</p>
                    <Link to="/" className="inline-block mt-4 text-costco-blue font-bold hover:underline">
                        Дэлгүүр хэсэх
                    </Link>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {alertProducts.map(product => {
                        const priceInKRW = product.basePrice || product.price;
                        const displayPrice = currency === 'MNT'
                            ? Math.round(priceInKRW * wonRate)
                            : priceInKRW;
                        const currencySymbol = currency === 'MNT' ? '₮' : '₩';

                        return (
                            <div key={product.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex gap-4">
                                <Link to={`/product/${product.id}`} className="shrink-0 w-24 h-24 bg-gray-100 rounded-lg overflow-hidden">
                                    <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                                </Link>
                                <div className="flex-1 min-w-0 flex flex-col">
                                    <Link to={`/product/${product.id}`} className="font-bold text-gray-900 line-clamp-2 mb-1 hover:text-costco-blue">
                                        {product.name}
                                    </Link>
                                    <div className="mt-auto flex items-end justify-between">
                                        <div>
                                            <div className="text-costco-red font-bold">
                                                {displayPrice.toLocaleString()}{currencySymbol}
                                            </div>
                                            {product.discount && (
                                                <div className="text-xs text-green-600 font-bold bg-green-50 px-2 py-0.5 rounded-full inline-block mt-1">
                                                    Хямдарсан байна!
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => {
                                                    addToCart(product);
                                                    showToast('Сагсанд нэмэгдлээ', 'success');
                                                }}
                                                className="p-2 bg-blue-50 text-costco-blue rounded-lg hover:bg-blue-100 transition"
                                                title="Сагсанд нэмэх"
                                            >
                                                <ShoppingCart size={18} />
                                            </button>
                                            <button
                                                onClick={() => removeAlert(product.id)}
                                                className="p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition"
                                                title="Жагсаалтаас хасах"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
