// chatService — Cloudflare Worker only (Firestore removed).
// Support chat lives in D1; realtime is emulated with polling. Attachments upload to R2
// via the Worker; the message model is text-based, so an attachment URL is appended to
// the message text.
import { chatApi, adminApi } from './apiClient';

// Shared conversation listeners notified by the main message poller so we never run
// two separate polling loops against GET /api/chat.
const convListeners = new Set();

export const chatService = {
    async getOrCreateConversation(userId, userName) {
        try { const r = await chatApi.get(false); return r.conversation || { id: 'cf', userId, userName }; }
        catch { return { id: 'cf', userId, userName }; }
    },

    // Upload a chat attachment → R2; returns the served URL.
    async uploadFile(file /*, path */) {
        try { return await chatApi.upload(file); }
        catch (error) { console.error('Error uploading file:', error); throw error; }
    },

    async sendMessage(conversationId, message, isFromAdmin = false, metadata = null, attachment = null, opts = {}) {
        const text = message || '';
        const attachObj = attachment && typeof attachment === 'object' ? attachment : null;
        if (isFromAdmin && !opts.asBot) {
            await adminApi.chatReply(conversationId, text, metadata, attachObj);
        } else {
            await chatApi.send(text, metadata, isFromAdmin ? 'admin' : undefined, attachObj);
        }
        return true;
    },

    // Poll the conversation's messages with adaptive intervals (3s when open/active,
    // 15s when closed or tab hidden). Also fans out `r.conversation` to any
    // subscribeToConversation listeners so only a single HTTP poll runs.
    subscribeToMessages(conversationId, callback, limitCount = 50, opts = {}) {
        let stop = false;
        let timer = null;
        const poll = async () => {
            if (stop) return;
            try {
                if (typeof document !== 'undefined' && document.hidden && !opts.admin) {
                    scheduleNext();
                    return;
                }
                const markRead = opts.shouldMarkRead ? !!opts.shouldMarkRead() : false;
                const r = opts.admin ? await adminApi.chat(conversationId) : await chatApi.get(markRead);
                if (!stop) {
                    const msgs = (r.messages || []).map((m) => ({
                        ...m,
                        createdAt: m.createdAt ? new Date(m.createdAt) : new Date(),
                    }));
                    callback(limitCount > 0 ? msgs.slice(-limitCount) : msgs);
                    if (!opts.admin && r.conversation) {
                        convListeners.forEach((fn) => {
                            try { fn(r.conversation); } catch { /* ignore */ }
                        });
                    }
                }
            } catch { /* keep polling */ }
            scheduleNext();
        };
        const scheduleNext = () => {
            if (stop) return;
            const isOpen = opts.isOpen ? !!opts.isOpen() : true;
            const delay = opts.admin ? 3000 : (isOpen ? 3000 : 15000);
            timer = setTimeout(poll, delay);
        };
        poll();
        return () => { stop = true; clearTimeout(timer); };
    },

    subscribeToConversation(conversationId, callback) {
        convListeners.add(callback);
        return () => { convListeners.delete(callback); };
    },

    // Explicitly clear unreadByUser on the server when the user opens the chat modal.
    async markAsRead(conversationId, isAdmin = false) {
        if (isAdmin) return;
        try {
            const r = await chatApi.get(true);
            if (r?.conversation) {
                convListeners.forEach((fn) => {
                    try { fn(r.conversation); } catch { /* ignore */ }
                });
            }
        } catch { /* non-fatal */ }
    },

    // Any user message already flags the conversation for admin (needsAdmin=1) server-side.
    async markAsNeedsAdmin() { return; },

    async broadcastMessage(text, imageFile = null) {
        let body = text || '';
        if (imageFile) { try { const url = await chatApi.upload(imageFile); body = body ? `${body}\n${url}` : url; } catch { /* text only */ } }
        const r = await adminApi.broadcast(body);
        return r?.sent || 0;
    },

    async getAllConversations() {
        try { return (await adminApi.chats())?.conversations || []; }
        catch (error) { console.error('Error fetching conversations:', error); return []; }
    },

    async togglePinMessage(conversationId, messageId, isPinned) {
        try { await adminApi.pinMessage(messageId, isPinned); return true; }
        catch (error) { console.error('Error pinning message:', error); throw error; }
    },

    async toggleLikeMessage(conversationId, messageId, isLiked) {
        try { await adminApi.likeMessage(messageId, isLiked); return true; }
        catch (error) { console.error('Error liking message:', error); throw error; }
    },
};
