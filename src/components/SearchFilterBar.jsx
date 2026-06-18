import { Search, Star, Percent, Tag, Flame, ArrowUp, ArrowDown, X } from 'lucide-react';
import { useProductStore } from '../store/productStore';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { smartSearchFilter } from '../utils/searchUtils';

export default function SearchFilterBar() {
    const {
        searchTerm,
        setSearchTerm,
        currentTag,
        setTagFilter,
        priceSort,
        setPriceSort,
        currency,
        isAiSearching,
        resetSearch,
        products,
        searchHistory = []
    } = useProductStore();

    const [showDropdown, setShowDropdown] = useState(false);

    const searchResults = searchTerm && showDropdown
        ? smartSearchFilter(products, searchTerm).slice(0, 5)
        : [];
        
    const displayHistory = !searchTerm && showDropdown && searchHistory.length > 0;

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
        <div className="w-full bg-white/95 backdrop-blur-sm px-3 pt-3 pb-2 flex flex-col md:flex-row gap-2 md:items-center">

            {/* Top Row: Search + Price Sort */}
            <div className="flex items-center gap-2 w-full md:flex-1 min-w-0">
                {/* Search Bar */}
                <div className="relative flex-1 min-w-0 h-8">
                    {/* Autocomplete Dropdown (Pops UP) */}
                    {(showDropdown && searchResults.length > 0) && (
                        <div className="absolute bottom-full mb-2 left-0 right-0 w-full bg-white border border-gray-100 shadow-2xl rounded-xl overflow-hidden z-[100] animate-in slide-in-from-bottom-2 fade-in">
                            {searchResults.map(p => (
                                <Link 
                                    to={`/product/${p.id}`} 
                                    key={p.id} 
                                    onClick={() => setShowDropdown(false)}
                                    className="flex items-center gap-3 p-2 hover:bg-blue-50 border-b border-gray-50 last:border-b-0 transition"
                                >
                                    <div className="w-10 h-10 bg-white rounded border border-gray-100 shrink-0 flex items-center justify-center p-1">
                                        <img src={p.image} alt="" loading="lazy" decoding="async" onError={(e) => { e.target.style.visibility = 'hidden'; }} className="w-full h-full object-contain" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-semibold text-gray-800 truncate">{p.name}</div>
                                        <div className="text-[10px] font-bold text-costco-blue mt-0.5">{(p.price || 0).toLocaleString()} ₮</div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                    
                    {displayHistory && (
                        <div className="absolute bottom-full mb-2 left-0 right-0 w-full bg-white border border-gray-100 shadow-2xl rounded-xl p-2 z-[100] animate-in slide-in-from-bottom-2 fade-in">
                            <div className="text-xs font-semibold text-gray-400 mb-2 px-2">Сүүлд хайсан</div>
                            <div className="flex flex-wrap gap-2">
                                {searchHistory.map((item, index) => (
                                    <button
                                        key={index}
                                        onClick={() => {
                                            setSearchTerm(item);
                                            setShowDropdown(false);
                                        }}
                                        className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs px-3 py-1.5 rounded-full transition-colors flex items-center gap-1"
                                    >
                                        <Search size={12} className="text-gray-400" />
                                        {item}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    <input
                        type="text"
                        placeholder="Хайх..."
                        aria-label="Бараа хайх"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onFocus={() => setShowDropdown(true)}
                        onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                        className={`w-full h-full pl-10 pr-10 rounded-xl bg-gray-100 border-0 focus:ring-2 focus:ring-costco-blue/30 focus:bg-white outline-none text-sm font-medium placeholder:text-gray-400 transition-all ${isAiSearching ? 'animate-pulse' : ''}`}
                    />
                    <Search className={`absolute left-3 top-1/2 -translate-y-1/2 transition-colors ${isAiSearching ? 'text-blue-500' : 'text-gray-400'}`} size={18} />

                    {/* Smart Search Indicator */}
                    {isAiSearching && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1">
                            <span className="w-1 h-1 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                            <span className="w-1 h-1 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                            <span className="w-1 h-1 bg-blue-500 rounded-full animate-bounce"></span>
                        </div>
                    )}

                    {!isAiSearching && searchTerm && (
                        <button
                            onClick={resetSearch}
                            aria-label="Хайлт цэвэрлэх"
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>

                {/* Price Sort Button - Now next to search */}
                <button
                    onClick={cyclePriceSort}
                    aria-label={priceSort === 'asc' ? 'Үнэ: хямдаас үнэтэй рүү' : priceSort === 'desc' ? 'Үнэ: үнэтэйгээс хямд руу' : 'Үнээр эрэмбэлэх'}
                    className={`h-8 px-4 rounded-xl text-sm font-semibold transition-all shrink-0 flex items-center gap-1.5 ${priceSort
                        ? 'bg-gradient-to-r from-violet-500 to-purple-500 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                >
                    {priceSort === 'desc' && <ArrowDown size={14} className="stroke-[2.5]" />}
                    {priceSort === 'asc' && <ArrowUp size={14} className="stroke-[2.5]" />}
                    {!priceSort && <ArrowUp size={14} className="stroke-[2.5] opacity-50" />}
                    <span className="font-bold text-[10px] sm:text-sm">{currency === 'KRW' ? '₩' : 'Үнэ'}</span>
                </button>
            </div>

            {/* Filter Pills - Horizontal scroll (Remaining filters) */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1 w-full shrink-0 md:w-auto md:mx-0 md:px-0 md:pb-0">
                {/* Star (Онцгой) */}
                <button
                    onClick={() => toggleTag('Онцгой')}
                    aria-label="Онцгой бараа шүүх"
                    aria-pressed={currentTag === 'Онцгой'}
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
                    aria-pressed={currentTag === 'Sale'}
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
                    aria-pressed={currentTag === 'New'}
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
                    aria-pressed={currentTag === 'Kirkland'}
                    className={`h-8 px-3 rounded-full text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 ${currentTag === 'Kirkland'
                        ? 'bg-gradient-to-r from-costco-blue to-blue-600 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                >
                    <span className="font-black text-sm">Kirkland</span>
                </button>

                {/* Featured */}
                <button
                    onClick={() => toggleTag('Featured')}
                    aria-label="Онцлох бараа шүүх"
                    aria-pressed={currentTag === 'Featured'}
                    className={`h-8 px-3 rounded-full text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 ${currentTag === 'Featured'
                        ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                >
                    <Flame size={13} className={currentTag === 'Featured' ? "fill-white" : "fill-orange-400 text-orange-400"} />
                </button>
            </div>
        </div>
    );
}
