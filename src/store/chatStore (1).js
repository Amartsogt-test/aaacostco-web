import { create } from 'zustand';
import { chatService } from '../services/chatService';

export const useChatStore = create((set, get) => ({
    isOpen: false,
    messages: [],
    conversationId: null,
    unreadCount: 0,
    isLoading: false,
    unsubscribe: null,

    openChat: () => set({ isOpen: true }),
    closeChat: () => set({ isOpen: false }),
    toggleChat: () => set(state => ({ isOpen: !state.isOpen })),

    // Open chat with pre-filled product inquiry
    openWithProduct: (product) => {
        set({ isOpen: true, pendingProductMessage: product });
    },
    pendingProductMessage: null,
    clearPendingMessage: () => set({ pendingProductMessage: null }),

    initializeChat: async (userId, userName) => {
        if (get().conversationId) return; // Already initialized

        set({ isLoading: true, messageLimit: 5 }); // Default to 5 messages
        try {
            const conversation = await chatService.getOrCreateConversation(userId, userName);
            set({ conversationId: conversation.id });

            // Internal helper to subscribe
            const subscribe = (limit) => {
                // Unsubscribe previous if exists
                if (get().unsubscribe) get().unsubscribe();

                const unsub = chatService.subscribeToMessages(conversation.id, (messages) => {
                    set({ messages, isLoading: false });
                }, limit);
                set({ unsubscribe: unsub });
            };

            // Initial subscription
            subscribe(5);

        } catch (error) {
            console.error("Failed to initialize chat:", error);
            set({ isLoading: false });
        }
    },

    loadMoreMessages: () => {
        const { conversationId, messageLimit, unsubscribe } = get();
        if (!conversationId) return;

        const newLimit = messageLimit + 20;
        set({ messageLimit: newLimit, isLoading: true });

        // Re-subscribe with new limit
        // Note: In a real app we might want to just fetch older ones, but for simplicity/consistency with live sync,
        // we re-subscribe with a larger limit.
        if (unsubscribe) unsubscribe();

        const unsub = chatService.subscribeToMessages(conversationId, (messages) => {
            set({ messages, isLoading: false });
        }, newLimit);

        set({ unsubscribe: unsub });
    },

    sendMessage: async (text, metadata = null) => {
        const { conversationId } = get();
        // Allow empty text if metadata is present (e.g. for product cards or attachments)
        if (!conversationId || (!text?.trim() && !metadata)) return;

        try {
            await chatService.sendMessage(conversationId, text.trim(), false, metadata);
        } catch (error) {
            console.error("Failed to send message:", error);
        }
    },

    sendAdminMessage: async (text) => {
        const { conversationId } = get();
        if (!conversationId || !text.trim()) return;

        try {
            await chatService.sendMessage(conversationId, text.trim(), true);
        } catch (error) {
            console.error("Failed to send admin message:", error);
        }
    },

    markAsRead: async () => {
        const { conversationId } = get();
        if (!conversationId) return;

        await chatService.markAsRead(conversationId, false);
        set({ unreadCount: 0 });
    },

    togglePinMessage: async (messageId, isPinned) => {
        const { conversationId } = get();
        if (!conversationId) return;

        try {
            await chatService.togglePinMessage(conversationId, messageId, isPinned);
        } catch (error) {
            console.error("Failed to toggle pin:", error);
        }
    },

    toggleLikeMessage: async (messageId, isLiked) => {
        const { conversationId } = get();
        if (!conversationId) return;

        try {
            await chatService.toggleLikeMessage(conversationId, messageId, isLiked);
        } catch (error) {
            console.error("Failed to toggle like:", error);
        }
    },

    sendAttachment: async (file, type) => {
        const { conversationId } = get();
        if (!conversationId) return;

        try {
            const path = `chat-attachments/${conversationId}/${Date.now()}_${file.name}`;
            const url = await chatService.uploadFile(file, path);
            await chatService.sendMessage(conversationId, '', false, null, { type, url });
        } catch (error) {
            console.error("Failed to send attachment:", error);
        }
    },

    cleanup: () => {
        const { unsubscribe } = get();
        if (unsubscribe) {
            unsubscribe();
        }
        set({
            isOpen: false,
            messages: [],
            conversationId: null,
            unsubscribe: null
        });
    }
}));
