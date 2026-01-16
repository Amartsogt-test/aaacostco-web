
import { useState, useRef, useEffect } from 'react';
import { ShoppingCart, Menu, User, MessageCircle, ArrowRightLeft, Home } from 'lucide-react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import { useProductStore } from '../store/productStore';
import { useUIStore } from '../store/uiStore';
import { useAuthStore } from '../store/authStore';
import { useOrderStore } from '../store/orderStore';
import { chatService } from '../services/chatService';
import { useChatStore } from '../store/chatStore';
import SearchFilterBar from './SearchFilterBar';


export default function Header({ layoutStyle }) {
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const isAdmin = location.pathname.startsWith('/admin');
    const view = searchParams.get('view');
    const isStandalone = view === 'spreadsheet' || view === 'summary';
    const cartCount = useCartStore(state => state.totalItems());
    const { toggleCurrency, currency, toggleMenu, toggleCart, closeCart, isCartOpen, isMenuOpen } = useUIStore();
    const { wonRate, resetSearch } = useProductStore();
    const { user } = useAuthStore();
    const { toggleChat, unreadCount, isOpen: isChatOpen } = useChatStore();

    // Helper to calculate admin unread count
    const [adminConversations, setAdminConversations] = useState([]);
    const [adminUnreadCount, setAdminUnreadCount] = useState(0);
    const [isCurrencyActive, setCurrencyActive] = useState(false);

    // Close modal on location change or home click
    useEffect(() => {
        closeCart();
        setCurrencyActive(false);
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

    const handleHomeClick = () => {
        closeCart();
        resetSearch();
        setCurrencyActive(false);
    };

    const { fetchOrders } = useOrderStore();

    useEffect(() => {
        if (user) {
            fetchOrders();
        }
    }, [user, fetchOrders]);

    // Fetch admin conversations if user is admin
    useEffect(() => {
        if (!user?.isAdmin) return;

        const fetchConversations = async () => {
            const convs = await chatService.getAllConversations();
            setAdminConversations(convs);
            // Calculate unread count
            const unread = convs.reduce((acc, curr) => acc + (curr.unreadByAdmin || 0), 0);
            setAdminUnreadCount(unread);
        };

        // Initial fetch for badge
        fetchConversations();

        // Optional: Polling for real-time updates (every 30s)
        const interval = setInterval(fetchConversations, 30000);
        return () => clearInterval(interval);
    }, [user]);



    // Determine if we should show SearchFilterBar (only on product listing pages)
    const showSearchFilter = location.pathname === '/' || location.pathname.startsWith('/category');

    return (
        <header>
            {/* Combined Bottom Bar: Search + Navigation */}
            <div
                style={layoutStyle}
                className="fixed bottom-0 bg-white/95 backdrop-blur-md shadow-[0_-2px_20px_rgba(0,0,0,0.08)] border-t border-gray-100 z-[70] flex flex-col transition-all duration-300"
            >
                {showSearchFilter && <SearchFilterBar />}

                {/* Bottom Navigation - Modern pill design */}
                <div className="w-full bg-transparent py-2 px-2">
                    <div className="w-full flex items-center justify-around gap-1">

                        {/* Helper for Styles */}
                        {(() => {
                            const getIconStyle = (isActive) => isActive
                                ? "p-1.5 rounded-xl bg-gradient-to-br from-costco-blue to-blue-600 text-white shadow-sm transition-all"
                                : "p-1.5 rounded-xl bg-gray-100 text-gray-600 group-hover:bg-gray-200 group-hover:scale-110 transition-all";

                            // On Desktop, sidebar might be open, but we don't count it as "Active Page" for the button.
                            // On Mobile, we navigate to /chat, so this works perfectly.
                            // FIX: Ensure mutual exclusivity. If Cart is open, others should be gray.
                            const isChatActive = !isCartOpen && (location.pathname === '/chat' || location.pathname.startsWith('/admin/chat'));
                            const isProfile = !isCartOpen && location.pathname.startsWith('/profile');

                            // Don't lose Home active state just because Chat Sidebar is open.
                            // Keep !isCartOpen as carts are overlay modals often.
                            const isHome = location.pathname === '/' && !isCartOpen && !searchParams.get('menu');

                            // Check menu state directly from store (need to import isMenuOpen)
                            // But wait, toggleMenu relies on store. Let's fix props first.
                            // We need isMenuOpen from UI store.

                            return (
                                <>
                                    {/* Home */}
                                    <Link to="/" onClick={handleHomeClick} className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl hover:bg-gray-100 transition-all group">
                                        <div className={getIconStyle(isHome)}>
                                            <Home size={18} />
                                        </div>
                                        <span className={`text-[10px] font-semibold ${isHome ? 'text-costco-blue' : 'text-gray-700'}`}>Нүүр</span>
                                    </Link>

                                    {/* Menu */}
                                    <button
                                        onClick={() => {
                                            toggleMenu();
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

                                    {/* Chat */}
                                    <button
                                        onClick={() => {
                                            if (user?.isAdmin) {
                                                if (window.innerWidth >= 1024) {
                                                    navigate('/admin/chat');
                                                    if (!isChatOpen) toggleChat();
                                                } else {
                                                    navigate('/admin/chat');
                                                }
                                            } else if (window.innerWidth < 1024) {
                                                navigate('/chat');
                                            } else {
                                                toggleChat();
                                            }
                                            setCurrencyActive(false);
                                        }}
                                        className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl hover:bg-gray-100 transition-all group relative"
                                    >
                                        <div className={`${getIconStyle(isChatActive)} relative`}>
                                            <MessageCircle size={18} />
                                            {((user?.isAdmin ? adminUnreadCount : unreadCount) > 0) && (
                                                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1">
                                                    {user?.isAdmin ? adminUnreadCount : unreadCount}
                                                </span>
                                            )}
                                        </div>
                                        <span className={`text-[10px] font-semibold ${isChatActive ? 'text-costco-blue' : 'text-gray-600'}`}>Чат</span>
                                    </button>

                                    {/* Cart */}
                                    <button
                                        onClick={() => {
                                            toggleCart();
                                            setCurrencyActive(false);
                                        }}
                                        className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl hover:bg-gray-100 transition-all group relative"
                                    >
                                        <div className={`${getIconStyle(isCartOpen)} relative`}>
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

                        {/* Exchange Rate */}
                        <button
                            onClick={() => {
                                toggleCurrency();
                                setCurrencyActive(true);
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
                    </div>
                </div>
            </div>
        </header>
    );
}
