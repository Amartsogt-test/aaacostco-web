import { Search, Star, Percent, Tag, Flame, ArrowUp, ArrowDown } from 'lucide-react';
import { useProductStore } from '../store/productStore';

export default function SearchFilterBar() {
    const {
        searchTerm,
        setSearchTerm,
        currentTag,
        setTagFilter,
        priceSort,
        setPriceSort,
        currency
    } = useProductStore();

    const toggleTag = (tag) => {
        if (currentTag === tag) {
            setTagFilter(null);
        } else {
            setTagFilter(tag);
        }
    };

    const cyclePriceSort = () => {
        if (!priceSort) {
            setPriceSort('asc');
        } else if (priceSort === 'asc') {
            setPriceSort('desc');
        } else {
            setPriceSort(null);
        }
    };

    return (
        <div className="w-full bg-white/95 backdrop-blur-sm px-3 pt-3 pb-2 flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
            {/* Search Bar - Modern rounded design */}
            <div className="relative flex-1 w-full md:w-auto min-w-0">
                <input
                    type="text"
                    placeholder="Хайх..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full h-10 pl-10 pr-4 rounded-xl bg-gray-100 border-0 focus:ring-2 focus:ring-costco-blue/30 focus:bg-white outline-none text-sm font-medium placeholder:text-gray-400 transition-all"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            </div>

            {/* Filter Pills - Horizontal scroll with modern pill design */}
            <div className="flex items-center gap-1.5 mt-0 md:mt-0 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1 md:pb-0 md:px-0 md:mx-0 w-full md:w-auto shrink-0">
                {/* Star (Онцгой) */}
                <button
                    onClick={() => toggleTag('Онцгой')}
                    className={`h-8 px-3 rounded-full text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 ${currentTag === 'Онцгой'
                        ? 'bg-gradient-to-r from-yellow-400 to-orange-400 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                >
                    <Star size={13} className={currentTag === 'Онцгой' ? "fill-white" : "fill-yellow-400 text-yellow-400"} />
                </button>

                {/* Sale */}
                <button
                    onClick={() => toggleTag('Sale')}
                    className={`h-8 px-3 rounded-full text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 ${currentTag === 'Sale'
                        ? 'bg-gradient-to-r from-red-500 to-pink-500 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                >
                    <Percent size={12} />
                    <span>Sale</span>
                </button>

                {/* New */}
                <button
                    onClick={() => toggleTag('New')}
                    className={`h-8 px-3 rounded-full text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 ${currentTag === 'New'
                        ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                >
                    <Tag size={12} />
                    <span>New</span>
                </button>

                {/* Kirkland */}
                <button
                    onClick={() => toggleTag('Kirkland')}
                    className={`h-8 px-3 rounded-full text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 ${currentTag === 'Kirkland'
                        ? 'bg-gradient-to-r from-costco-blue to-blue-600 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                >
                    <span className="font-black text-sm">K</span>
                    <span className="hidden sm:inline">K</span>
                </button>

                {/* Featured */}
                <button
                    onClick={() => toggleTag('Featured')}
                    className={`h-8 px-3 rounded-full text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 ${currentTag === 'Featured'
                        ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                >
                    <Flame size={13} className={currentTag === 'Featured' ? "fill-white" : "fill-orange-400 text-orange-400"} />
                </button>

                {/* Price Sort */}
                <button
                    onClick={cyclePriceSort}
                    className={`h-8 px-3 rounded-full text-xs font-semibold transition-all shrink-0 flex items-center gap-1 ${priceSort
                        ? 'bg-gradient-to-r from-violet-500 to-purple-500 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                >
                    {priceSort === 'desc' && <ArrowDown size={13} className="stroke-[2.5]" />}
                    {priceSort === 'asc' && <ArrowUp size={13} className="stroke-[2.5]" />}
                    {!priceSort && <ArrowUp size={13} className="stroke-[2.5] opacity-50" />}
                    <span className="font-bold">{currency === 'KRW' ? '₩' : 'Үнэ'}</span>
                </button>
            </div>
        </div>
    );
}
