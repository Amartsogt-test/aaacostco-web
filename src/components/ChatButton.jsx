import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import { useEffect, useState, useRef } from 'react';
import { MessageCircle, X } from 'lucide-react';

import { useLocation } from 'react-router-dom';

import { useUIStore } from '../store/uiStore';

export default function ChatButton() {
    const { isOpen, toggleChat, initializeChat, unreadCount } = useChatStore();
    const { user, isAuthenticated } = useAuthStore();
    const { isMenuOpen } = useUIStore();
    const location = useLocation();

    // Pages that have the SearchFilterBar at the bottom
    const isSearchPage = location.pathname === '/' || location.pathname.startsWith('/category') || location.pathname === '/saved';

    // Initialize chat when modal opens - for both authenticated and guest users
    useEffect(() => {
        if (isOpen) {
            // Generate user ID based on auth state
            let userId, userName;

            if (isAuthenticated && user) {
                userId = user.uid || user.phone || `user-${Date.now()}`;
                userName = user.name || user.phone || 'User';
            } else {
                // Guest user - use a persistent ID from localStorage or generate new
                let guestId = localStorage.getItem('guest-chat-id');
                if (!guestId) {
                    guestId = `guest-${Date.now()}`;
                    localStorage.setItem('guest-chat-id', guestId);
                }
                userId = guestId;
                userName = 'Зочин';
            }

            initializeChat(userId, userName);
        }
    }, [isOpen, isAuthenticated, user, initializeChat]);

    // Auto-open chat on desktop (User Request: "Always open on laptop")
    // Track screen size to prevent duplicate mounting
    const [_isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);

    useEffect(() => {
        let hasAutoOpened = false;

        const handleResize = () => {
            const isLg = window.innerWidth >= 1024;
            setIsDesktop(isLg);
            // Admins use the dedicated /admin/chat page (separate URL) — never
            // auto-open the support-chat sidebar over the product views for them.
            if (useAuthStore.getState().user?.isAdmin) return;
            if (isLg && !hasAutoOpened) { 
                hasAutoOpened = true; // lg breakpoint - auto open once
                if (!useChatStore.getState().isOpen) {
                    useChatStore.getState().openChat();
                    
                    // Auto close after 2 seconds to become a small icon
                    setTimeout(() => {
                        if (useChatStore.getState().isOpen) {
                            useChatStore.getState().closeChat();
                        }
                    }, 2000);
                }
            }
        };

        window.addEventListener('resize', handleResize);

        // Initial check
        handleResize();

        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Mobile users have the bottom navigation bar.
    // Desktop/Tablet users need a floating button if not using the sidebar (or even if using it, to toggle).
    // We render this button primarily for non-mobile or when the bottom nav is not sufficient.
    // However, Header.jsx has a bottom nav that shows on all screens currently? 
    // Let's assume this button is the "Right side" button user wants.

    if (!user && !isAuthenticated && window.innerWidth < 1024) {
        // On mobile guest, we might rely on Header.jsx? 
        // But let's render it for everyone for now to ensure visibility as requested.
        // Or strictly follow "isDesktop"?
        // Let's rely on CSS media queries or the `isDesktop` state.
    }

    // Always render, let CSS handle positioning/hiding if needed.
    // User specifically asked for "right side button".

    // Check if we are on a dedicated chat page
    const isChatRoute = location.pathname === '/chat' || location.pathname.startsWith('/admin/chat');

    // User Request: Remove the "X" minimize button when chat is open.
    // Also remove it if we are on the dedicated chat route (buttons are redundant there)
    // Drag state and refs
    const [position, setPosition] = useState(() => {
        try {
            const saved = localStorage.getItem('chatIconPosition');
            if (saved) return JSON.parse(saved);
        } catch {
            // ignore
        }
        return { x: 0, y: 0 };
    });
    const positionRef = useRef(position);
    const draggingRef = useRef(false);
    const startPosRef = useRef({ offsetX: 0, offsetY: 0, startX: 0, startY: 0 });
    const hasMovedRef = useRef(false);



    // Initial position is now handled in useState lazy initializer

    // AND hide it if the Menu Drawer is open so it doesn't overlap the menu on small screens!
    if (isOpen || isChatRoute || isMenuOpen) return null;

    // Admins keep chat OUT of the product views — their chat lives on its own
    // /admin/chat URL (reachable from the Admin Portal / admin host), so the
    // floating support-chat button never overlaps the catalog for them.
    if (user?.isAdmin) return null;


    const handlePointerDown = (e) => {
        // Only accept primary mouse button or touch
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        draggingRef.current = true;
        hasMovedRef.current = false;
        
        startPosRef.current = {
            offsetX: e.clientX - positionRef.current.x,
            offsetY: e.clientY - positionRef.current.y,
            startX: e.clientX,
            startY: e.clientY
        };
        e.currentTarget.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e) => {
        if (!draggingRef.current) return;
        
        const moveDist = Math.hypot(e.clientX - startPosRef.current.startX, e.clientY - startPosRef.current.startY);
        if (moveDist > 5) {
            hasMovedRef.current = true;
        }
        
        if (hasMovedRef.current) {
            const newPos = {
                x: e.clientX - startPosRef.current.offsetX,
                y: e.clientY - startPosRef.current.offsetY
            };
            setPosition(newPos);
            positionRef.current = newPos;
        }
    };

    const handlePointerUp = (e) => {
        if (!draggingRef.current) return;
        draggingRef.current = false;
        e.currentTarget.releasePointerCapture(e.pointerId);
        
        if (hasMovedRef.current) {
            try {
                localStorage.setItem('chatIconPosition', JSON.stringify(positionRef.current));
            } catch {
                // ignore
            }
        } else {
            // If it didn't move, treat it as a click
            toggleChat();
        }
    };

    // 📌 Anchor the floating button to the RIGHT EDGE OF THE CONTENT (max-w-5xl),
    // not the raw viewport edge. On wide desktop screens a viewport-fixed button
    // drifts far into the empty margin beside the centred content; pinning it to a
    // centred max-width row keeps it visually attached to the main window.
    return (
        <div
            className={`fixed ${isSearchPage ? 'bottom-48' : 'bottom-32'} inset-x-0 z-[100] flex justify-center px-4 sm:px-6 pointer-events-none`}
        >
            <div className="w-full max-w-[1150px] flex justify-end">
                <div
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    style={{ transform: `translate(${position.x}px, ${position.y}px)`, touchAction: 'none' }}
                    className="pointer-events-auto"
                >
                    <button
                        id="floating-chat-toggle"
                        className={`relative p-4 rounded-full shadow-lg transition-colors transform hover:scale-105 active:scale-95 flex items-center justify-center
                            ${isOpen ? 'bg-white text-gray-800 border border-gray-200' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                        aria-label={unreadCount > 0 ? `Чат нээх, ${unreadCount} шинэ мессеж` : 'Чат нээх'}
                    >
                        {isOpen ? <X size={24} /> : <MessageCircle size={24} />}

                        {/* Unread Badge */}
                        {!isOpen && unreadCount > 0 && (
                            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center shadow-sm pointer-events-none">
                                {unreadCount}
                            </span>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
