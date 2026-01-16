
import { Link } from 'react-router-dom';
import { useWishlistStore } from '../store/wishlistStore';
import ProductCard from '../components/ProductCard';

export default function SavedContent() {
    const { wishlist } = useWishlistStore();

    if (wishlist.length === 0) {
        return (
            <div className="py-20 text-center flex flex-col items-center justify-center h-full">
                <h2 className="text-xl font-bold text-gray-800 mb-2">No saved items</h2>
                <p className="text-gray-500 mb-6 text-sm">Та таалагдсан бараагаа зүрх дээр дарж хадгалаарай.</p>
                <Link to="/" className="inline-block bg-costco-blue text-white px-6 py-2.5 rounded font-medium hover:bg-blue-700 transition text-sm">
                    Нүүр хуудас руу буцах
                </Link>
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto p-4 custom-scrollbar">
            <h1 className="text-xl font-bold text-gray-900 mb-4 sticky top-0 bg-white z-10 py-2">Saved ({wishlist.length})</h1>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pb-20">
                {/* Persistent Gift Cards - Always Visible */}
                {/* 1. Costco KR Gift Certificate */}
                <div className="relative group">
                    <div className="bg-white border border-blue-200 rounded-lg p-0 flex flex-col justify-between h-[300px] shadow-sm hover:shadow-md transition overflow-hidden">
                        <div className="text-center h-full flex flex-col">
                            <div className="h-40 bg-gray-100 w-full overflow-hidden relative">
                                <img
                                    src="/costco_gift_certificate.png"
                                    alt="Costco Gift Certificate"
                                    className="w-full h-full object-cover"
                                />
                            </div>
                            <div className="p-3">
                                <h3 className="font-bold text-gray-800 text-lg mb-1 leading-tight">Costco Gift Certificate</h3>
                                <p className="text-blue-700 font-bold text-xl">100,000₩</p>
                                <p className="text-gray-500 text-xs mt-1">~250,000₮</p>
                            </div>
                        </div>

                        <div className="p-3 pt-0">
                            <button
                                onClick={() => {
                                    import('../store/cartStore').then(({ useCartStore }) => {
                                        useCartStore.getState().addToCart({
                                            id: `gc-won-100000`,
                                            name: `Costco Gift Certificate 100,000₩`,
                                            price: 250000,
                                            image: '/costco_gift_certificate.png',
                                            weight: 0,
                                            isGiftCard: true
                                        });
                                        alert('Сагсанд нэмэгдлээ');
                                    });
                                }}
                                className="w-full bg-blue-600 text-white py-2 rounded-lg font-bold text-sm hover:bg-blue-700 transition"
                            >
                                Сагсанд хийх
                            </button>
                        </div>
                    </div>
                </div>

                {/* 2. MNT Gift Cards */}
                {[50000, 100000, 200000, 500000].map((amount) => (
                    <div key={`gc-${amount}`} className="relative group">
                        <div className="bg-gradient-to-br from-yellow-50 to-amber-100 border border-amber-200 rounded-lg p-4 flex flex-col justify-between h-[300px] shadow-sm hover:shadow-md transition">
                            <div className="text-center mt-4">
                                <div className="w-16 h-16 bg-amber-200 rounded-full flex items-center justify-center mx-auto mb-4 text-amber-700 font-bold text-2xl">
                                    🎁
                                </div>
                                <h3 className="font-bold text-gray-800 text-lg mb-1">Digital Gift Card</h3>
                                <p className="text-amber-700 font-bold text-xl">{amount.toLocaleString()}₮</p>
                            </div>

                            <button
                                onClick={() => {
                                    import('../store/cartStore').then(({ useCartStore }) => {
                                        useCartStore.getState().addToCart({
                                            id: `gc-${amount}`,
                                            name: `Digital Gift Card ${amount.toLocaleString()}₮`,
                                            price: amount,
                                            image: 'https://placehold.co/400x400/FFA500/FFFFFF?text=Gift+Card',
                                            weight: 0,
                                            isGiftCard: true
                                        });
                                        // Optional: Show toast
                                        alert('Сагсанд нэмэгдлээ');
                                    });
                                }}
                                className="w-full bg-black text-white py-2 rounded-lg font-bold text-sm hover:bg-gray-800 transition mt-auto"
                            >
                                Сагсанд хийх
                            </button>

                            {/* No Delete Button for these */}
                        </div>
                    </div>
                ))}

                {/* Regular Saved Items */}
                {wishlist.map((product) => (
                    <div key={product.id}>
                        <ProductCard product={product} />
                    </div>
                ))}
            </div>
        </div>
    );
}
