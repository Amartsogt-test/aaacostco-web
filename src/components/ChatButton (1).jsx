import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import { useEffect, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';

export default function ChatButton() {
    const { isOpen, toggleChat, initializeChat, unreadCount } = useChatStore();
    const { user, isAuthenticated } = useAuthStore();

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
    const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);

    useEffect(() => {
        const handleResize = () => {
            const isLg = window.innerWidth >= 1024;
            setIsDesktop(isLg);
            if (isLg) { // lg breakpoint
                if (!useChatStore.getState().isOpen) {
                    useChatStore.getState().openChat();
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

    // User Request: Remove the "X" minimize button when chat is open.
    // Since this button acts as the minimize button when open, we hide it completely.
    if (isOpen) return null;

    return (
        <button
            onClick={toggleChat}
            className={`fixed bottom-24 right-6 z-[60] p-4 rounded-full shadow-lg transition-all transform hover:scale-105 active:scale-95 flex items-center justify-center
                ${isOpen ? 'bg-white text-gray-800 border border-gray-200' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
            aria-label="Toggle Chat"
        >
            {isOpen ? <X size={24} /> : <MessageCircle size={24} />}

            {/* Unread Badge */}
            {!isOpen && unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center shadow-sm">
                    {unreadCount}
                </span>
            )}
        </button>
    );
}
