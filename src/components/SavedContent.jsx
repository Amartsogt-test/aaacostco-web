
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useWishlistStore } from '../store/wishlistStore';
import { useCartStore } from '../store/cartStore';
import { useProductStore } from '../store/productStore'; // Added import
import ProductCard from '../components/ProductCard';

// Helper Component for Custom Amount Gift Card
function CustomGiftCard() {
    const [amount, setAmount] = useState('');

    const handleAdd = () => {
        const value = parseInt(amount.replace(/,/g, ''), 10);
        if (!value || value <= 0) {
            alert('Үнийн дүнгээ зөв оруулна уу.');
            return;
        }

        useCartStore.getState().addToGround({
            id: `gc-custom-${Date.now()}`,
            name: `Digital Gift Card ${value.toLocaleString()}₮`,
            price: value,
            image: 'https://placehold.co/400x400/FFA500/FFFFFF?text=Gift+Card',
            weight: 0,
            isGiftCard: true,
            category: 'Gift Card'
        }, null, 1);

        setAmount('');
        alert('Сагсанд нэмэгдлээ');
    };

    return (
        <div className="relative group">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-100 border border-indigo-200 rounded-lg p-3 flex flex-col justify-between h-[160px] shadow-sm hover:shadow-md transition">
                <div className="flex flex-col items-center justify-center flex-1 w-full">
                    <h3 className="font-bold text-gray-800 text-xs text-center mb-2 leading-tight">
                        Та өөрийн хүссэн дүнгээрээ<br />Digital gift card үүсгэ
                    </h3>
                    <div className="w-full px-2">
                        <input
                            type="number"
                            placeholder="247,247₮"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="w-full text-center font-bold text-indigo-700 bg-white/50 border border-indigo-200 rounded py-1 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                    </div>
                </div>

                <button
                    onClick={handleAdd}
                    className="w-full bg-indigo-600 text-white py-1.5 rounded font-bold text-xs hover:bg-indigo-700 transition mt-2"
                >
                    Сагсанд хийх
                </button>
            </div>
        </div>
    );
}

export default function SavedContent() {
    const { wishlist } = useWishlistStore();
    const { searchTerm } = useProductStore();

    // Filter items based on search term
    const filteredWishlist = wishlist.filter(item =>
        !searchTerm ||
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.name_mn && item.name_mn.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="h-full overflow-y-auto p-4 custom-scrollbar">
            <h1 className="text-xl font-bold text-gray-900 mb-4 sticky top-0 bg-white z-10 py-2">Хадгалсан ({wishlist.length})</h1>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pb-20">
                {/* Persistent Gift Cards - Always Visible */}
                {/* 1. Costco KR Gift Certificate */}
                <div className="relative group">
                    <div className="bg-gradient-to-br from-blue-50 to-white border border-blue-200 rounded-lg p-3 flex flex-col justify-between h-[160px] shadow-sm hover:shadow-md transition overflow-hidden">
                        <div className="flex flex-col items-center justify-center flex-1 w-full">
                            <h3 className="font-bold text-gray-800 text-xs mb-2 text-center leading-tight">Costco Gift Certificate</h3>
                            <div className="h-20 mb-1 flex items-center justify-center">
                                <img
                                    src="/costco_gift_certificate_v2.png"
                                    alt="Costco Gift Certificate"
                                    className="h-full w-auto object-contain"
                                />
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                useCartStore.getState().addToGround({
                                    id: `gc-won-100000`,
                                    name: `Costco Gift Certificate 100,000₩`,
                                    price: 250000,
                                    image: '/costco_gift_certificate_v2.png',
                                    weight: 0,
                                    isGiftCard: true
                                }, null, 1);
                                alert('Сагсанд нэмэгдлээ');
                            }}
                            className="w-full bg-blue-600 text-white py-1.5 rounded font-bold text-xs hover:bg-blue-700 transition mt-auto"
                        >
                            Сагсанд хийх
                        </button>
                    </div>
                </div>

                {/* 2. MNT Gift Cards - 8 Options (Non-deletable) */}
                {[100000, 500000].map((amount) => (
                    <div key={`gc-${amount}`} className="relative group">
                        <div className="bg-gradient-to-br from-yellow-50 to-amber-100 border border-amber-200 rounded-lg p-3 flex flex-col justify-between h-[160px] shadow-sm hover:shadow-md transition">
                            <div className="flex flex-col items-center justify-center flex-1">
                                <h3 className="font-bold text-gray-800 text-xs mb-1">Digital Gift Card</h3>
                                <div className="w-10 h-10 bg-amber-200 rounded-full flex items-center justify-center text-amber-700 font-bold text-lg mb-2">
                                    🎁
                                </div>
                                <p className="text-amber-700 font-bold text-lg">{amount.toLocaleString()}₮</p>
                            </div>

                            <button
                                onClick={() => {
                                    useCartStore.getState().addToGround({
                                        id: `gc-${amount}`,
                                        name: `Digital Gift Card ${amount.toLocaleString()}₮`,
                                        price: amount,
                                        image: 'https://placehold.co/400x400/FFA500/FFFFFF?text=Gift+Card',
                                        weight: 0,
                                        isGiftCard: true,
                                        category: 'Gift Card'
                                    }, null, 1);
                                    alert('Сагсанд нэмэгдлээ');
                                }}
                                className="w-full bg-black text-white py-1.5 rounded font-bold text-xs hover:bg-gray-800 transition mt-2"
                            >
                                Сагсанд хийх
                            </button>
                        </div>
                    </div>
                ))}

                {/* 3. Custom Amount Gift Card */}
                <CustomGiftCard />

                {/* Regular Saved Items */}
                {filteredWishlist.length > 0 ? (
                    filteredWishlist.map((product) => (
                        <div key={product.id}>
                            <ProductCard product={product} />
                        </div>
                    ))
                ) : (
                    wishlist.length > 0 && (
                        <div className="col-span-full py-10 text-center text-gray-500">
                            <p>Хайлт илэрцгүй.</p>
                        </div>
                    )
                )}
            </div>
        </div>
    );
}
