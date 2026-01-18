import { useState, useEffect } from 'react';
import { X, ChevronRight, ArrowRight, Home } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useUIStore } from '../store/uiStore';
import { useProductStore } from '../store/productStore';
import { MENU_DATA } from '../data/menuData'; // Keep this for fallback
import buildInfo from '../buildInfo.json';

export default function MenuDrawer() {
    const { isMenuOpen, closeMenu } = useUIStore();
    const { categories, fetchCategories, resetSearch } = useProductStore();
    const [activeCategory, setActiveCategory] = useState(null);

    // Construct fallback categories from static data
    const fallbackCategories = MENU_DATA.map(m => ({
        id: m.code,
        label: m.label,
        banner: m.banner,
        count: 0,
        subcategories: []
    })).sort((a, b) => {
        const numA = parseInt(a.id.replace('cos_', '')) || 999;
        const numB = parseInt(b.id.replace('cos_', '')) || 999;
        return numA - numB;
    });

    const displayCategories = categories.length > 0 ? categories : fallbackCategories;
    const activeData = displayCategories.find(c => c.id === activeCategory);

    // Fetch categories on mount
    useEffect(() => {
        fetchCategories();
    }, [fetchCategories]);

    // Initialize active category when menu opens or categories change
    useEffect(() => {
        if (displayCategories && displayCategories.length > 0 && !activeCategory) {
            // Use setTimeout to push state update to next tick to avoid synchronous update warning
            const timer = setTimeout(() => {
                setActiveCategory(displayCategories[0].id);
            }, 0);
            return () => clearTimeout(timer);
        }
    }, [displayCategories, activeCategory]);

    // Lock body scroll when menu is open
    useEffect(() => {
        if (isMenuOpen) {
            document.body.style.overflow = 'hidden';
            if (!activeCategory && displayCategories.length > 0) {
                const timer = setTimeout(() => {
                    setActiveCategory(displayCategories[0].id);
                }, 0);
                return () => clearTimeout(timer);
            }
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isMenuOpen, displayCategories, activeCategory]);

    return (
        <>
            {/* Overlay */}
            {isMenuOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-[85] transition-opacity"
                    onClick={closeMenu}
                />
            )}

            {/* Drawer Container - Sidebar */}
            <div
                className={`fixed top-0 left-0 bottom-0 w-full md:w-[800px] bg-white z-[90] transform transition-transform duration-300 ease-in-out flex flex-col shadow-2xl overflow-hidden ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
                    <div className="font-bold text-xl text-costco-blue">АНГИЛАЛ</div>
                    <button onClick={closeMenu} className="p-2 hover:bg-gray-100 rounded-full transition">
                        <X size={24} />
                    </button>
                </div>

                {/* Content - 2 Column Layout */}
                <div className="flex flex-1 overflow-hidden">
                    {/* Left Column: Main Categories */}
                    <div className="w-[35%] md:w-[280px] bg-gray-50 overflow-y-auto border-r h-full pb-[140px]">
                        {/* Home Link */}
                        <Link
                            to="/"
                            onClick={() => {
                                closeMenu();
                                resetSearch();
                                window.scrollTo({ top: 0, behavior: 'instant' });
                            }}
                            className="w-full text-left px-5 py-4 flex items-center gap-3 transition-colors duration-200 border-l-4 border-transparent text-gray-600 hover:bg-gray-100"
                        >
                            <Home size={20} />
                            <span className="text-sm font-bold">Нүүр</span>
                        </Link>

                        {displayCategories.map((category) => {
                            // Resolve Icon at runtime from static Map
                            // Do NOT use category.icon from store because functions cannot be persisted/serialized
                            let Icon = null;
                            const staticData = MENU_DATA.find(m => m.code === category.id);
                            if (staticData) {
                                Icon = staticData.icon;
                            }

                            // Fallback if still no icon
                            if (!Icon) {
                                Icon = MENU_DATA[0].icon;
                            }
                            const isActive = activeCategory === category.id;
                            return (
                                <button
                                    key={category.id}
                                    onMouseEnter={() => setActiveCategory(category.id)}
                                    onClick={() => setActiveCategory(category.id)}
                                    className={`w-full text-left px-5 py-4 flex items-center gap-3 transition-colors duration-200 border-l-4 ${isActive
                                        ? 'bg-white border-costco-blue text-costco-blue font-bold shadow-sm'
                                        : 'border-transparent text-gray-600 hover:bg-gray-100'
                                        }`}
                                >
                                    {Icon && <Icon size={20} />}
                                    <span className="text-sm flex-1">{category.label}</span>
                                    <span className="text-[10px] tabular-nums font-normal opacity-60 bg-gray-200/50 px-1.5 py-0.5 rounded-md">
                                        {category.count || 0}
                                    </span>
                                    {isActive && <ChevronRight size={16} className="ml-1" />}
                                </button>
                            );
                        })}

                        {/* Build Info */}
                        <div className="py-6 px-2 text-[10px] text-gray-300 text-center tabular-nums opacity-60">
                            {buildInfo.buildTime}
                        </div>
                    </div>

                    {/* Right Column: Subcategories & Banner */}
                    <div className="flex-1 overflow-y-auto bg-white p-6 h-full pb-[140px]">
                        {activeData ? (
                            <div className="animate-in fade-in duration-300">
                                {/* Banner Image */}
                                {activeData.banner && (
                                    <div className="mb-4">
                                        <div className="rounded-xl overflow-hidden aspect-[3/1] relative">
                                            <img
                                                key={activeData.banner}
                                                src={activeData.banner}
                                                alt={activeData.label}
                                                className="w-full h-full object-cover"
                                                loading="lazy"
                                                onError={(e) => e.target.style.display = 'none'}
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-r from-black/60 to-transparent flex items-center px-8">
                                                <h2 className="text-3xl font-bold text-white leading-tight">{activeData.label}</h2>
                                            </div>
                                        </div>
                                        <div className="mt-3">
                                            {(() => {
                                                const staticLinkData = MENU_DATA.find(m => m.code === activeData.id || m.label === activeData.label) || activeData;
                                                const linkId = staticLinkData.code || activeData.id;
                                                return (
                                                    <Link
                                                        to={`/category/${linkId}`}
                                                        onClick={closeMenu}
                                                        className="inline-flex items-center gap-2 px-6 py-2.5 bg-costco-blue hover:bg-costco-blue/90 text-white text-sm font-bold rounded-lg transition shadow-sm"
                                                    >
                                                        Бүх {activeData.label} харах ({activeData.count || 0})
                                                        <ArrowRight size={16} />
                                                    </Link>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                )}

                                {/* Subcategories Grid */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-10">
                                    {activeData.subcategories && activeData.subcategories.map((sub) => (
                                        <div key={sub.id || sub.code || sub.label}>
                                            <Link
                                                to={`/category/${encodeURIComponent(activeData.id)}/${encodeURIComponent(sub.code || sub.id)}`}
                                                onClick={closeMenu}
                                                className="font-bold text-gray-900 text-lg mb-4 flex items-center hover:text-costco-blue transition group"
                                            >
                                                {sub.label}
                                                <ArrowRight size={16} className="ml-2 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                                            </Link>

                                            {/* Level 3 Items */}
                                            <ul className="space-y-2.5">
                                                {(sub.subcategories || sub.items || []).map((item, idx) => (
                                                    <li key={idx}>
                                                        <Link
                                                            to={`/category/${encodeURIComponent(activeData.id)}/${encodeURIComponent(item.code || item.id)}`}
                                                            onClick={closeMenu}
                                                            className="text-gray-500 hover:text-costco-blue hover:underline text-sm transition"
                                                        >
                                                            {item.label}
                                                        </Link>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    ))}

                                    {/* Fallback if no subs */}
                                    {(!activeData.subcategories || activeData.subcategories.length === 0) && (
                                        <div className="col-span-2 text-gray-400 text-center py-10">
                                            Дэд ангилал байхгүй байна.
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            // Empty State or Loading
                            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                                {displayCategories.length > 0 ? "Ангилал сонгоно уу" : "Уншиж байна..."}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
