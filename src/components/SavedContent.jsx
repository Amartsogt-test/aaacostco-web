
import { Link } from 'react-router-dom';
import { useWishlistStore } from '../store/wishlistStore';
import { useProductStore } from '../store/productStore';
import ProductCard from '../components/ProductCard';
import { smartSearchFilter } from '../utils/searchUtils';

export default function SavedContent() {
    const { wishlist } = useWishlistStore();
    const { searchTerm } = useProductStore();

    // Filter items based on search term
    const filteredWishlist = searchTerm 
        ? smartSearchFilter(wishlist, searchTerm) 
        : wishlist;

    return (
        <div className="h-full overflow-y-auto p-4 custom-scrollbar">
            <h1 className="text-xl font-bold text-gray-900 mb-4 sticky top-0 bg-white z-10 py-2">Хадгалсан ({wishlist.length})</h1>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pb-20">
                {/* Digital gift cards temporarily removed (per request). */}

                {/* Regular Saved Items */}
                {filteredWishlist.length > 0 ? (
                    filteredWishlist.map((product) => (
                        <div key={product.id}>
                            <ProductCard product={product} />
                        </div>
                    ))
                ) : wishlist.length > 0 ? (
                    <div className="col-span-full py-10 text-center text-gray-500">
                        <p>Хайлт илэрцгүй.</p>
                    </div>
                ) : (
                    <div className="col-span-full py-16 text-center text-gray-400">
                        <p className="font-medium">Хадгалсан бараа байхгүй байна.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
