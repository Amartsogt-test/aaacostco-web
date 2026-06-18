import { useState, useEffect, useMemo } from 'react';
import { X, ChevronRight, ArrowRight, Home, ChevronDown, ChevronUp } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useUIStore } from '../store/uiStore';
import { useProductStore } from '../store/productStore';
import { MENU_DATA } from '../data/menuData'; // Keep this for fallback
import buildInfo from '../buildInfo.json';
import { getSubcategoryIcon } from '../utils/subcategoryIcons';

export default function MenuDrawer() {
    const [searchParams] = useSearchParams();
    const { isMenuOpen, closeMenu } = useUIStore();
    const { categories, fetchCategories, resetSearch, products } = useProductStore();
    const [activeCategory, setActiveCategory] = useState(null);
    const [isStoreExpanded, setStoreExpanded] = useState(false);

    // 🖼️ Derive a representative image per (sub)category from loaded products. Codes
    // are hierarchical (e.g. cos_6.1.2), so we index every prefix — that way a
    // level-2 tile (cos_6.1) picks up an image from any product deeper in its tree.
    // Falls back to the category icon when nothing matches.
    const subCategoryImage = useMemo(() => {
        const map = {};
        for (const p of (products || [])) {
            if (!p?.image) continue;
            const code = p.subCategory || p.category;
            if (code) {
                const parts = String(code).split('.');
                for (let i = 1; i <= parts.length; i++) {
                    const prefix = parts.slice(0, i).join('.');
                    if (!map[prefix]) map[prefix] = p.image;
                }
            }
            if (p.category && !map[p.category]) map[p.category] = p.image;
        }
        return map;
    }, [products]);

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

    // Lock body scroll + close on Escape when menu is open
    useEffect(() => {
        if (isMenuOpen) {
            document.body.style.overflow = 'hidden';
            const onKey = (e) => { if (e.key === 'Escape') closeMenu(); };
            window.addEventListener('keydown', onKey);
            let timer;
            if (!activeCategory && displayCategories.length > 0) {
                timer = setTimeout(() => setActiveCategory(displayCategories[0].id), 0);
            }
            return () => {
                window.removeEventListener('keydown', onKey);
                if (timer) clearTimeout(timer);
                document.body.style.overflow = 'unset';
            };
        }
        document.body.style.overflow = 'unset';
    }, [isMenuOpen, displayCategories, activeCategory, closeMenu]);

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
                    <button onClick={closeMenu} aria-label="Цэс хаах" className="p-2 hover:bg-gray-100 rounded-full transition">
                        <X size={24} />
                    </button>
                </div>

                {/* Content - 2 Column Layout */}
                <div className="flex flex-1 overflow-hidden">
                    {/* Left Column: Main Categories */}
                    <div className="w-[110px] sm:w-[140px] md:w-[280px] bg-gray-50 overflow-y-auto border-r h-full pb-[140px] hide-scrollbar">
                        {/* Always show "Нүүр" first */}
                        <Link
                            to="/"
                            onClick={() => {
                                closeMenu();
                                resetSearch();
                                window.scrollTo({ top: 0, behavior: 'instant' });
                            }}
                            className={`w-full text-left px-1 py-3 md:px-5 md:py-4 flex flex-col md:flex-row items-center md:items-center gap-1 md:gap-3 transition-all duration-200 border-l-4 relative ${!activeCategory && !searchParams.get('menu')
                                ? 'bg-white border-costco-blue text-costco-blue font-bold shadow-[0_2px_10px_rgba(0,0,0,0.02)] z-10'
                                : 'border-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                                }`}
                        >
                            <Home size={18} className="md:w-5 md:h-5" />
                            <span className="text-[10px] md:text-sm text-center md:text-left flex-1 break-words">Нүүр</span>
                        </Link>

                        {displayCategories.map((category) => {
                            let Icon = null;
                            const staticData = MENU_DATA.find(m => m.code === category.id);
                            if (staticData) {
                                Icon = staticData.icon;
                            }
                            if (!Icon) {
                                Icon = MENU_DATA[0].icon;
                            }
                            const isActive = activeCategory === category.id;
                            return (
                                <button
                                    key={category.id}
                                    onMouseEnter={() => window.innerWidth >= 768 && setActiveCategory(category.id)}
                                    onClick={() => setActiveCategory(category.id)}
                                    className={`w-full text-left px-1 py-3 md:px-5 md:py-4 flex flex-col md:flex-row items-center md:items-center gap-1 md:gap-3 transition-all duration-200 border-l-4 relative ${isActive
                                        ? 'bg-white border-costco-blue text-costco-blue font-bold shadow-[0_2px_10px_rgba(0,0,0,0.02)] z-10'
                                        : 'border-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                                        }`}
                                >
                                    {Icon && <Icon size={18} className={`md:w-5 md:h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />}
                                    <span className="text-[10px] md:text-sm leading-tight text-center md:text-left flex-1 w-full break-words">
                                        {category.label}
                                    </span>
                                    <span className="hidden md:flex text-[10px] tabular-nums font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                                        {category.count || 0}
                                    </span>
                                    {isActive && <ChevronRight size={14} className="hidden md:block ml-1 opacity-50" />}
                                </button>
                            );
                        })}

                        {/* Build Info */}
                        <div className="py-6 px-2 text-[8px] md:text-[10px] text-gray-300 text-center tabular-nums opacity-60">
                            {buildInfo.buildTime}
                        </div>
                    </div>

                    {/* Right Column: Subcategories & Banner */}
                    <div className="flex-1 overflow-y-auto bg-white p-4 md:p-6 h-full pb-[140px]">
                        {activeData ? (
                            <div className="animate-in fade-in duration-300">
                                {/* Banner Image (optional — some categories have no banner) */}
                                {activeData.banner && (
                                    <div className="mb-3">
                                        <div className="rounded-xl overflow-hidden aspect-[3/1] relative shadow-sm">
                                            <img
                                                key={activeData.banner}
                                                src={activeData.banner}
                                                alt={activeData.label}
                                                className="w-full h-full object-cover"
                                                loading="lazy"
                                                onError={(e) => e.target.style.display = 'none'}
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent flex items-center px-4 md:px-8">
                                                <h2 className="text-xl md:text-3xl font-bold text-white leading-tight drop-shadow-md">{activeData.label}</h2>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* "View all" link — ALWAYS shown so banner-less categories
                                    are still reachable. Adds a plain title when no banner. */}
                                <div className="mb-4 md:mb-6">
                                    {!activeData.banner && (
                                        <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-3">{activeData.label}</h2>
                                    )}
                                    {(() => {
                                        const staticLinkData = MENU_DATA.find(m => m.code === activeData.id || m.label === activeData.label) || activeData;
                                        const linkId = staticLinkData.code || activeData.id;
                                        return (
                                            <Link
                                                to={`/category/${linkId}`}
                                                onClick={closeMenu}
                                                className="inline-flex items-center justify-center w-full md:w-auto gap-2 px-6 py-2.5 bg-costco-blue hover:bg-blue-700 text-white text-xs md:text-sm font-bold rounded-lg transition shadow-sm"
                                            >
                                                Бүх {activeData.label} харах ({activeData.count || 0})
                                                <ArrowRight size={16} />
                                            </Link>
                                        );
                                    })()}
                                </div>

                                {/* Subcategories — Temu-style image tiles. Each tile shows a
                                    representative product image (or the category icon) and links
                                    to that subcategory. */}
                                {(() => {
                                    const ActiveIcon = (MENU_DATA.find(m => m.code === activeData.id || m.id === activeData.id) || {}).icon || MENU_DATA[0].icon;
                                    const subs = activeData.subcategories || [];
                                    if (subs.length === 0) {
                                        return (
                                            <div className="text-gray-400 text-center py-10 text-sm">Дэд ангилал байхгүй байна.</div>
                                        );
                                    }
                                    return (
                                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 md:gap-4">
                                            {subs.map((sub) => {
                                                const code = sub.code || sub.id;
                                                const img = subCategoryImage[code] || subCategoryImage[sub.id];
                                                const SubIcon = getSubcategoryIcon(sub.label, ActiveIcon);
                                                return (
                                                    <Link
                                                        key={sub.id || sub.code || sub.label}
                                                        to={`/category/${encodeURIComponent(activeData.id)}/${encodeURIComponent(code)}`}
                                                        onClick={closeMenu}
                                                        className="flex flex-col items-center text-center group"
                                                    >
                                                        <div className="w-full aspect-square rounded-2xl bg-gray-50 border border-gray-100 overflow-hidden flex items-center justify-center mb-1.5 group-hover:border-costco-blue/40 group-hover:shadow-sm transition">
                                                            {img ? (
                                                                <img
                                                                    src={img}
                                                                    alt=""
                                                                    loading="lazy"
                                                                    decoding="async"
                                                                    onError={(e) => { e.target.style.visibility = 'hidden'; }}
                                                                    className="w-full h-full object-contain p-1.5"
                                                                />
                                                            ) : (
                                                                <SubIcon size={26} className="text-gray-400" />
                                                            )}
                                                        </div>
                                                        <span className="text-[11px] md:text-xs text-gray-700 leading-tight line-clamp-2 group-hover:text-costco-blue transition-colors">
                                                            {sub.label}
                                                        </span>
                                                    </Link>
                                                );
                                            })}
                                        </div>
                                    );
                                })()}
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
