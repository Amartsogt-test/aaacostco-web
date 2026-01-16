import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import ChatModal from '../components/ChatModal';

/**
 * Mobile-optimized full-screen chat page
 * This page is used on mobile devices instead of the popup modal
 */
export default function Chat() {
    const navigate = useNavigate();
    const { initializeChat, closeChat } = useChatStore();
    const { user, isAuthenticated } = useAuthStore();

    // Initialize chat on mount
    useEffect(() => {
        let userId, userName;

        if (isAuthenticated && user) {
            userId = user.uid || user.phone || `user-${Date.now()}`;
            userName = user.name || user.phone || 'User';
        } else {
            let guestId = localStorage.getItem('guest-chat-id');
            if (!guestId) {
                guestId = `guest-${Date.now()}`;
                localStorage.setItem('guest-chat-id', guestId);
            }
            userId = guestId;
            userName = 'Зочин';
        }

        initializeChat(userId, userName);
    }, [isAuthenticated, user, initializeChat]);

    // Handle back navigation
    const handleClose = () => {
        closeChat();
        navigate(-1); // Go back
    };

    return (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
            {/* Full-screen chat modal wrapper */}
            <div className="flex-1 flex flex-col h-full">
                <ChatModal
                    isSidebar={false}
                    isFullScreen={true}
                    onClose={handleClose}
                />
            </div>
        </div>
    );
}
