import { Outlet, useLocation, useSearchParams } from 'react-router-dom';
import Header from './Header';
import Toast from './Toast';
import MenuDrawer from './MenuDrawer';
import ChatButton from './ChatButton';
import { useChatStore } from '../store/chatStore';
import { useUIStore } from '../store/uiStore';
import React, { Suspense, lazy, useRef, useState, useLayoutEffect } from 'react';

const ChatModal = lazy(() => import('./ChatModal'));
const CartMenuModal = lazy(() => import('./CartMenuModal'));


export default function Layout() {
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const isAdmin = location.pathname.startsWith('/admin');
    const view = searchParams.get('view');
    const isStandalone = view === 'spreadsheet' || view === 'summary';

    const { isOpen: isChatOpen } = useChatStore();
    const { isCartOpen, closeCart } = useUIStore();

    // -- NEW: Layout Measurement Logic --
    const mainWrapperRef = useRef(null);
    const [headerStyle, setHeaderStyle] = useState({});

    useLayoutEffect(() => {
        const updatePosition = () => {
            if (mainWrapperRef.current) {
                const rect = mainWrapperRef.current.getBoundingClientRect();
                setHeaderStyle({
                    left: `${rect.left}px`,
                    width: `${rect.width}px`
                });
            }
        };

        // Initial measurement
        updatePosition();

        // Window resize
        window.addEventListener('resize', updatePosition);

        // Sidebar resize logic - ResizeObserver
        const observer = new ResizeObserver(updatePosition);
        if (mainWrapperRef.current) {
            observer.observe(mainWrapperRef.current);
        }

        // When chat state changes, wait for CSS transition to complete
        const transitionTimer = setTimeout(updatePosition, 350);

        return () => {
            window.removeEventListener('resize', updatePosition);
            observer.disconnect();
            clearTimeout(transitionTimer);
        };
    }, [isChatOpen]); // Re-run when chat state changes

    return (
        <div className={`min-h-screen flex flex-col bg-gray-50 ${(location.pathname === '/chat' || location.pathname === '/admin/chat') ? 'pb-0' : 'pb-[140px]'}`}>
            {!isStandalone && <Header layoutStyle={headerStyle} />}

            {/* Main Content Wrapper - Centered in available space */}
            <div
                className={`flex flex-col lg:flex-row w-full transition-all duration-300 gap-6 px-0 sm:px-4
                ${isChatOpen && !isStandalone && location.pathname !== '/chat' && location.pathname !== '/admin/chat'
                        ? 'lg:pr-[400px]' // Reserve space for fixed sidebar
                        : ''
                    }`}>
                <main ref={mainWrapperRef} className={`flex-1 w-full min-w-0 relative mx-auto max-w-5xl`}>
                    {isCartOpen ? (
                        <div className="w-full h-full min-h-[500px] animate-in fade-in slide-in-from-bottom-4 duration-300">
                            <Suspense fallback={<div className="h-96 w-full flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div></div>}>
                                <CartMenuModal isOpen={true} onClose={closeCart} isEmbedded={true} />
                            </Suspense>
                        </div>
                    ) : (
                        <Outlet />
                    )}
                </main>

                {/* Desktop Chat Sidebar - Show for both admin and regular users */}
                {isChatOpen && !isStandalone && location.pathname !== '/chat' && location.pathname !== '/admin/chat' && (
                    <aside className="hidden lg:flex w-[400px] shrink-0 flex-col h-screen fixed top-0 right-0 z-50 bg-white shadow-xl border-l border-gray-100">
                        <Suspense fallback={<div className="w-full h-full bg-gray-50 animate-pulse" />}>
                            <ChatModal isSidebar={true} />
                        </Suspense>
                    </aside>
                )}
            </div>

            <MenuDrawer />
            <Toast />
            {!isAdmin && !isStandalone && <ChatButton />}
        </div>
    );
}
