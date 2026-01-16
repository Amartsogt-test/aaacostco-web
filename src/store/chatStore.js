import { create } from 'zustand';
import { chatService } from '../services/chatService';

export const useChatStore = create((set, get) => ({
    isOpen: false,
    messages: [],
    conversationId: null,
    unreadCount: 0,
    isLoading: false,
    unsubscribe: null,
    isAiLoading: false,

    openChat: () => set({ isOpen: true }),
    closeChat: () => set({ isOpen: false }),
    toggleChat: () => set(state => ({ isOpen: !state.isOpen })),

    // Open chat with pre-filled product inquiry
    openWithProduct: async (product) => {
        const { conversationId, processPendingProduct } = get();
        set({ isOpen: true, pendingProductMessage: product });

        // If already initialized, send immediately
        if (conversationId && product) {
            await processPendingProduct(product);
        }
    },
    pendingProductMessage: null,
    isProcessingInquiry: false,
    clearPendingMessage: () => set({ pendingProductMessage: null }),

    processPendingProduct: async (product) => {
        if (!product || get().isProcessingInquiry) return;

        // Mark as processing and clear pending immediately to prevent double-triggers
        set({ isProcessingInquiry: true, pendingProductMessage: null });

        try {
            const displayProductName = product.name_mn || product.englishName || product.name;

            await get().sendMessage("", {
                type: 'product',
                productId: product.id,
                productName: displayProductName,
                productImage: product.image
            });

            // Small delay for admin message to feel natural
            await new Promise(resolve => setTimeout(resolve, 800));

            // NEW: AI Product Summary
            try {
                set({ isAiLoading: true }); // Show loading indicator
                const { aiService } = await import('../services/aiService');
                const aiSummary = await aiService.generateProductSummary(product);

                if (aiSummary) {
                    await get().sendAdminMessage(aiSummary);
                } else {
                    // Fallback greeting if AI fails
                    await get().sendAdminMessage(
                        "Сайн байна уу? Түр хүлээгээрэй, удахгүй бид хариу бичих болно. Та асуух зүйлээ бичээд үлдээгээрэй. 🙏"
                    );
                }
            } catch (err) {
                console.error("AI Summary failed in Chat:", err);
                // Fallback greeting
                await get().sendAdminMessage(
                    "Сайн байна уу? Түр хүлээгээрэй, удахгүй бид хариу бичих болно. Та асуух зүйлээ бичээд үлдээгээрэй. 🙏"
                );
            } finally {
                set({ isAiLoading: false }); // Hide loading indicator
            }

        } catch (error) {
            console.error("Failed to process product inquiry:", error);
        } finally {
            set({ isProcessingInquiry: false });
        }
    },

    initializeChat: async (userId, userName) => {
        const { conversationId, isLoading, processPendingProduct } = get();
        if (conversationId || isLoading) return; // Already initialized or loading

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

            // Process pending product inquiry if exists
            const { pendingProductMessage } = get();
            if (pendingProductMessage) {
                await processPendingProduct(pendingProductMessage);
            }

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
            // 1. Send user message FIRST (always works even if AI fails)
            await chatService.sendMessage(conversationId, text.trim(), false, metadata);

        } catch (error) {
            console.error("Failed to send message:", error);
            set({ isAiLoading: false });
        }
        set({ isAiLoading: false });
    },

    requestAdmin: async () => {
        const { conversationId } = get();
        if (!conversationId) return;

        try {
            await chatService.markAsNeedsAdmin(conversationId);
            // Optionally notify user system message
            await chatService.sendMessage(conversationId, "Админ дуудлаа. Түр хүлээгээрэй.", false);
        } catch (error) {
            console.error("Failed to request admin:", error);
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
