import { Outlet, useLocation, useSearchParams } from 'react-router-dom';
import Header from './Header';
import Toast from './Toast';
import MenuDrawer from './MenuDrawer';
import ChatButton from './ChatButton';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import React, { Suspense, lazy, useRef, useState, useLayoutEffect } from 'react';

const ChatModal = lazy(() => import('./ChatModal'));



export default function Layout() {
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const _isAdmin = location.pathname.startsWith('/admin');
    const view = searchParams.get('view');
    const isStandalone = view === 'spreadsheet' || view === 'summary';

    const { isOpen: isChatOpen } = useChatStore();
    const { user } = useAuthStore(); // Access user for permanent sidebar check

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
    }, [isChatOpen, user?.isAdmin]); // Re-run when chat/admin state changes

    return (
        <div className={`min-h-screen flex flex-col bg-gray-50 ${(location.pathname === '/chat' || location.pathname === '/admin/chat') ? 'pb-0' : 'pb-[140px]'}`}>
            {!isStandalone && <Header layoutStyle={headerStyle} />}

            {/* Main Content Wrapper - Centered group */}
            <div className="flex flex-col lg:flex-row w-full transition-all duration-300 gap-6 px-0 sm:px-4 justify-center">
                <main ref={mainWrapperRef} className="w-full min-w-0 relative max-w-5xl">
                    <Outlet />
                </main>

                {/* Desktop Chat Sidebar - Sticky positioning to sit next to content */}
                {/* Logic: Show if Chat is Open */}
                {(isChatOpen) && (
                    <>
                        {/* Desktop Sidebar - Always show for Admin or if Toggled */}
                        <aside className="hidden lg:flex w-[400px] shrink-0 flex-col h-screen sticky top-0 z-50 bg-white shadow-xl border-l border-gray-100">
                            <Suspense fallback={<div className="w-full h-full bg-gray-50 animate-pulse" />}>
                                <ChatModal isSidebar={true} />
                            </Suspense>
                        </aside>

                        {/* Mobile/Tablet Modal - Only show if Toggled (isChatOpen) */}
                        {isChatOpen && (
                            <div className="lg:hidden fixed top-0 left-0 right-0 overflow-hidden" style={{ zIndex: 100, height: 'calc(100vh - 76px)' }}>
                                <div className="w-full h-full bg-white shadow-2xl flex flex-col overflow-hidden">
                                    <Suspense fallback={<div className="w-full h-full bg-gray-50 animate-pulse" />}>
                                        <ChatModal isSidebar={true} />
                                    </Suspense>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            <MenuDrawer />
            <Toast />
            {!isStandalone && <ChatButton />}
        </div>
    );
}
