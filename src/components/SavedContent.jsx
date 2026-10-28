
import { useState } from 'react';
import { ScanLine, Trash2, PackageSearch } from 'lucide-react';
import { useWishlistStore } from '../store/wishlistStore';
import { useProductStore } from '../store/productStore';
import ProductCard from '../components/ProductCard';
import LabelScanModal from '../components/LabelScanModal';
import { smartSearchFilter } from '../utils/searchUtils';

export default function SavedContent() {
    const { wishlist, scannedLabels, removeScannedLabel } = useWishlistStore();
    const { searchTerm } = useProductStore();
    const [scanOpen, setScanOpen] = useState(false);

    // Filter items based on search term
    const filteredWishlist = searchTerm
        ? smartSearchFilter(wishlist, searchTerm)
        : wishlist;

    return (
        <div className="h-full overflow-y-auto p-4 custom-scrollbar">
            {/* Header with in-store label scanner */}
            <div className="flex items-center justify-between gap-3 mb-4 sticky top-0 bg-white z-10 py-2">
                <h1 className="text-xl font-bold text-gray-900">Хадгалсан ({wishlist.length})</h1>
                <button
                    onClick={() => setScanOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-costco-blue text-white font-bold text-sm active:scale-95 transition shadow-sm"
                    title="Дэлгүүрийн шошго унших"
                >
                    <ScanLine size={18} /> Шошго унших
                </button>
            </div>

            {/* Scanned in-store labels not (yet) in our catalog */}
            {scannedLabels && scannedLabels.length > 0 && (
                <div className="mb-5">
                    <div className="flex items-center gap-2 mb-2 text-gray-500">
                        <PackageSearch size={16} />
                        <h2 className="text-sm font-bold uppercase tracking-wide">Уншсан шошго ({scannedLabels.length})</h2>
                    </div>
                    <p className="text-xs text-gray-400 mb-3">Манай дэлгүүрт одоогоор байхгүй — кодоор нь хайж захиалах боломжтой.</p>
                    <div className="space-y-2">
                        {scannedLabels.map((l) => (
                            <div key={l.code} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 flex items-center gap-3">
                                <div className="w-9 h-9 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
                                    <PackageSearch size={18} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-gray-900 text-sm truncate">{l.name || 'Нэр уншигдсангүй'}</p>
                                    <p className="text-[11px] text-gray-400">
                                        Код: {l.code}
                                        {l.brand ? ` • ${l.brand}` : ''}
                                        {l.price ? ` • ${l.price.toLocaleString()}₩` : ''}
                                        {l.unitSize ? ` • ${l.unitSize}` : ''}
                                    </p>
                                </div>
                                <button
                                    onClick={() => removeScannedLabel(l.code)}
                                    className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-50"
                                    title="Устгах"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pb-20">
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
                ) : scannedLabels && scannedLabels.length > 0 ? null : (
                    <div className="col-span-full py-16 text-center text-gray-400">
                        <p className="font-medium">Хадгалсан бараа байхгүй байна.</p>
                        <p className="text-sm mt-1">Дэлгүүрт яваад шошго уншуулж эхлээрэй.</p>
                    </div>
                )}
            </div>

            {scanOpen && <LabelScanModal onClose={() => setScanOpen(false)} />}
        </div>
    );
}
