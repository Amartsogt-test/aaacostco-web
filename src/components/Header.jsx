
import { useState, useEffect, useRef } from 'react';
import { ShoppingCart, Menu, User, Home, Store, ChevronUp, ChevronDown, ArrowRightLeft } from 'lucide-react';
import { Link, useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import { useProductStore } from '../store/productStore';
import { useUIStore } from '../store/uiStore';
import { useAuthStore } from '../store/authStore';
import { useOrderStore } from '../store/orderStore';
import { chatService } from '../services/chatService';
import { useChatStore } from '../store/chatStore';
import SearchFilterBar from './SearchFilterBar';


export default function Header({ layoutStyle }) {
    const location = useLocation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const _isAdmin = location.pathname.startsWith('/admin');
    const view = searchParams.get('view');
    const _isStandalone = view === 'spreadsheet' || view === 'summary';
    const cartCount = useCartStore(state => state.totalItems());
    const { toggleCurrency, currency, toggleMenu, closeCart, isCartOpen, closeMenu } = useUIStore();
    const { wonRate, resetSearch } = useProductStore();
    const { user } = useAuthStore();
    const { isOpen: isChatOpen, closeChat } = useChatStore();

    const [_adminUnreadCount, setAdminUnreadCount] = useState(0);
    const [isStoreMenuOpen, setStoreMenuOpen] = useState(false);
    const [selectedStore, setSelectedStore] = useState('Costco');
    const [isCurrencyActive, setCurrencyActive] = useState(false);
    
    const STORES = [
        { id: 'costco', name: 'Costco', color: 'text-red-600', icon: '🛒' },
        { id: 'emart', name: 'E-Mart', color: 'text-yellow-500', icon: '🏪' },
        { id: 'daiso', name: 'Daiso', color: 'text-rose-500', icon: '🌸' },
        { id: 'uniqlo', name: 'Uniqlo', color: 'text-red-600', icon: '👕' },
        { id: 'nike', name: 'Nike', color: 'text-black', icon: '👟' },
    ];

    // Auto-close store menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (isStoreMenuOpen && !e.target.closest('#store-selector-container')) {
                setStoreMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isStoreMenuOpen]);
    
    // Cart Animation
    const [isAnimatingCart, setIsAnimatingCart] = useState(false);
    const prevCartCount = useRef(cartCount);

    useEffect(() => {
        if (cartCount > prevCartCount.current) {
            setIsAnimatingCart(true);
            const timer = setTimeout(() => setIsAnimatingCart(false), 300);
            return () => clearTimeout(timer);
        }
        prevCartCount.current = cartCount;
    }, [cartCount]);

    // Close modal on location change or home click
    useEffect(() => {
        closeCart();
        // Only close chat on navigation if NOT admin AND on mobile (to preserve desktop sidebar)
        if (!user?.isAdmin && window.innerWidth < 1024) {
            closeChat();
        }
        closeMenu(); // Close menu on navigation (Added fix)
        setCurrencyActive(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location]);

    // Automatically revert currency active state after 2 seconds
    useEffect(() => {
        if (isCurrencyActive) {
            const timer = setTimeout(() => {
                setCurrencyActive(false);
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [isCurrencyActive]);

    // Automatically close store menu on navigation
    useEffect(() => {
        setStoreMenuOpen(false);
    }, [location.pathname]);

    const handleHomeClick = () => {
        closeCart();
        if (!user?.isAdmin && window.innerWidth < 1024) {
            closeChat();
        }
        closeMenu(); // Ensure menu closes
        resetSearch();
        setStoreMenuOpen(false);
        setCurrencyActive(false);
    };

    const { fetchOrders } = useOrderStore();

    useEffect(() => {
        if (user) {
            fetchOrders();
        }
    }, [user, fetchOrders]);

    // Fetch admin conversations if user is admin
    const prevAdminUnreadRef = useRef(null);
    useEffect(() => {
        if (!user?.isAdmin) return;

        // Ask once so new-message notifications can fire for the admin.
        import('../services/notifyService').then(({ ensureNotifyPermission }) => ensureNotifyPermission());
        // Register the admin's device for background push (FCM). No-op unless a
        // VAPID key is configured (see pushService).
        if (user?.uid) {
            import('../services/pushService').then(({ pushService }) => pushService.enableForAdmin(user.uid));
        }

        const fetchConversations = async () => {
            const convs = await chatService.getAllConversations();
            // Calculate unread count
            const unread = convs.reduce((acc, curr) => acc + (curr.unreadByAdmin || 0), 0);
            setAdminUnreadCount(unread);

            // 🔔 Desktop notification when the admin's unread total goes UP (a new
            // customer message arrived). Skip the very first poll so we don't alert
            // for the backlog on load.
            const prev = prevAdminUnreadRef.current;
            if (prev !== null && unread > prev) {
                import('../services/notifyService').then(({ notifyNewMessage }) => {
                    notifyNewMessage({ title: 'Шинэ чат мессеж', body: 'Хэрэглэгчээс шинэ мессеж ирлээ.', key: `admin-${unread}-${Date.now()}` });
                });
            }
            prevAdminUnreadRef.current = unread;
        };

        // Initial fetch for badge
        fetchConversations();

        // Optional: Polling for real-time updates (every 30s)
        const interval = setInterval(fetchConversations, 30000);
        return () => clearInterval(interval);
    }, [user]);



    // Determine if we should show SearchFilterBar (only on product listing pages and Saved)
    const showSearchFilter = location.pathname === '/' || location.pathname.startsWith('/category') || location.pathname === '/saved';

    return (
        <header>
            {/* Combined Bottom Bar: Search + Navigation */}
            <div
                style={{ ...layoutStyle, paddingBottom: 'env(safe-area-inset-bottom)' }}
                className="fixed bottom-0 bg-white/95 backdrop-blur-md shadow-[0_-2px_20px_rgba(0,0,0,0.08)] border-t border-gray-100 z-[80] flex flex-col transition-all duration-300"
            >
                {(showSearchFilter && !isCartOpen) && <SearchFilterBar />}

                {/* Bottom Navigation - Modern pill design */}
                <div className="w-full bg-transparent py-2 px-2 relative" id="store-selector-container">
                    
                    {/* Store Selection Popover */}
                    {isStoreMenuOpen && (
                        <div className="absolute bottom-full left-2 mb-2 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50 animate-fade-in origin-bottom-left">
                            <div className="p-2 bg-gray-50/50 border-b border-gray-50 text-xs font-bold text-gray-400 text-center uppercase tracking-wider">
                                Дэлгүүр сонгох
                            </div>
                            <div className="flex flex-col py-1">
                                {STORES.map((store) => (
                                    <button
                                        key={store.id}
                                        onClick={() => {
                                            if (store.id === 'costco') {
                                                setSelectedStore('Costco');
                                                navigate('/');
                                                setStoreMenuOpen(false);
                                            } else {
                                                useUIStore.getState().showToast(`${store.name} тун удахгүй...`, 'info');
                                                setStoreMenuOpen(false);
                                            }
                                        }}
                                        className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors ${selectedStore === store.name ? 'bg-blue-50/50' : ''}`}
                                    >
                                        <span className="text-lg">{store.icon}</span>
                                        <span className={`font-bold text-sm ${store.color}`}>{store.name}</span>
                                        {store.id !== 'costco' && (
                                            <span className="ml-auto text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">
                                                Удахгүй
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="w-full flex items-center justify-around gap-1">

                        {/* Helper for Styles */}
                        {(() => {
                            const getIconStyle = (isActive) => isActive
                                ? "p-1.5 rounded-xl bg-gradient-to-br from-costco-blue to-blue-600 text-white shadow-sm transition-all"
                                : "p-1.5 rounded-xl bg-gray-100 text-gray-600 group-hover:bg-gray-200 group-hover:scale-110 transition-all";

                            // On Desktop, sidebar might be open, but we don't count it as "Active Page" for the button.
                            // On Mobile, we navigate to /chat, so this works perfectly.
                            // FIX: Ensure mutual exclusivity. If Cart is open, others should be gray.
                            const _isChatActive = !isCartOpen && (isChatOpen || location.pathname === '/chat' || location.pathname.startsWith('/admin/chat'));
                            const isProfile = !isCartOpen && location.pathname.startsWith('/profile');

                            // Don't lose Home active state just because Chat Sidebar is open.
                            // Keep !isCartOpen as carts are overlay modals often.
                            const isHome = location.pathname === '/' && !isCartOpen && !searchParams.get('menu');

                            return (
                                <>
                                    {/* Store Selector (replaces Home) */}
                                    <button 
                                        onClick={(e) => {
                                            e.preventDefault();
                                            setStoreMenuOpen(!isStoreMenuOpen);
                                            setCurrencyActive(false);
                                            // Ensure navigating to / if not already
                                            if (location.pathname !== '/') {
                                                navigate('/');
                                            }
                                            window.scrollTo({ top: 0, behavior: 'smooth' });
                                        }} 
                                        className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl hover:bg-gray-100 transition-all group"
                                    >
                                        <div className={getIconStyle(isHome || isStoreMenuOpen)}>
                                            <Store size={18} />
                                        </div>
                                        <span className={`text-[10px] font-semibold ${isHome || isStoreMenuOpen ? 'text-costco-blue' : 'text-gray-700'}`}>
                                            Дэлгүүр
                                        </span>
                                    </button>

                                    {/* Menu */}
                                    <button
                                        onClick={() => {
                                            toggleMenu();
                                            setStoreMenuOpen(false);
                                            setCurrencyActive(false);
                                        }}
                                        className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl hover:bg-gray-100 transition-all group"
                                    >
                                        {/* Ideally we check isMenuOpen here, but Header doesn't subscribe to it yet. 
                                            Let's blindly assume default gray for now, or fetch it. */}
                                        <div className={getIconStyle(false)}>
                                            <Menu size={18} />
                                        </div>
                                        <span className="text-[10px] font-semibold text-gray-600">Цэс</span>
                                    </button>

                                    {/* Exchange Rate (Ханш) */}
                                    <button
                                        onClick={() => {
                                            toggleCurrency();
                                            setCurrencyActive(true);
                                            setStoreMenuOpen(false);
                                        }}
                                        className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl hover:bg-gray-100 transition-all group"
                                    >
                                        <div className={`${isCurrencyActive
                                            ? "p-1.5 rounded-xl bg-gradient-to-br from-costco-blue to-blue-600 text-white shadow-sm transition-all"
                                            : "p-1.5 rounded-xl bg-gray-100 text-gray-600 group-hover:bg-gray-200 group-hover:scale-110 transition-all"
                                            }`}>
                                            <ArrowRightLeft size={18} />
                                        </div>
                                        <span className={`text-[9px] font-bold whitespace-nowrap ${isCurrencyActive ? 'text-costco-blue' : 'text-gray-500'}`}>
                                            {(!wonRate || wonRate <= 0)
                                                ? '...'
                                                : (currency === 'MNT'
                                                    ? `${wonRate}₮`
                                                    : `${(1 / wonRate).toFixed(2)}₩`
                                                )
                                            }
                                        </span>
                                    </button>

                                    {/* Cart */}
                                    <button
                                        onClick={() => {
                                            navigate('/cart-menu');
                                            setStoreMenuOpen(false);
                                            closeMenu(); // Close menu if open
                                        }}
                                        aria-label={cartCount > 0 ? `Сагс, ${cartCount} бараа` : 'Сагс'}
                                        className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl hover:bg-gray-100 transition-all group relative"
                                    >
                                        <div className={`${getIconStyle(isCartOpen)} relative transition-transform duration-200 ${isAnimatingCart ? 'scale-125 rotate-3' : 'scale-100'}`}>
                                            <ShoppingCart size={18} />
                                            {cartCount > 0 && (
                                                <span className="absolute -top-0.5 right-1 min-w-[16px] h-4 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1">
                                                    {cartCount}
                                                </span>
                                            )}
                                        </div>
                                        <span className={`text-[10px] font-semibold ${isCartOpen ? 'text-costco-blue' : 'text-gray-600'}`}>Сагс</span>
                                    </button>

                                    {/* Profile */}
                                    <Link to="/profile" className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl hover:bg-gray-100 transition-all group">
                                        <div className={getIconStyle(isProfile)}>
                                            <User size={18} />
                                        </div>
                                        <span className={`text-[10px] font-semibold ${isProfile ? 'text-costco-blue' : 'text-gray-600'}`}>Профайл</span>
                                    </Link>
                                </>
                            );
                        })()}
                    </div>
                </div>
            </div>
        </header>
    );
}
