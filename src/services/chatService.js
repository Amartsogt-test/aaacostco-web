import { db, storage } from '../firebase';
import { collection, addDoc, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp, where, getDocs, limit } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const COLLECTION_NAME = 'chats';

export const chatService = {
    // Get or create a conversation for a user
    async getOrCreateConversation(userId, userName) {
        try {
            // Check if conversation exists
            const q = query(
                collection(db, COLLECTION_NAME),
                where('userId', '==', userId),
                limit(1)
            );
            const snapshot = await getDocs(q);

            if (!snapshot.empty) {
                return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
            }

            // Create new conversation
            const docRef = await addDoc(collection(db, COLLECTION_NAME), {
                userId,
                userName: userName || 'Guest',
                createdAt: serverTimestamp(),
                lastMessage: null,
                lastMessageAt: serverTimestamp(),
                unreadByAdmin: 0,
                unreadByUser: 0,
                needsAdmin: false // Default: Admin doesn't need to see this yet
            });

            return { id: docRef.id, userId, userName };
        } catch (error) {
            console.error("Error getting/creating conversation:", error);
            throw error;
        }
    },

    // Upload file to storage
    async uploadFile(file, path) {
        try {
            const storageRef = ref(storage, path);
            const snapshot = await uploadBytes(storageRef, file);
            return await getDownloadURL(snapshot.ref);
        } catch (error) {
            console.error("Error uploading file:", error);
            throw error;
        }
    },

    // Send a message
    async sendMessage(conversationId, message, isFromAdmin = false, metadata = null, attachment = null) {
        try {
            const messagesRef = collection(db, COLLECTION_NAME, conversationId, 'messages');

            await addDoc(messagesRef, {
                text: message || '', // Message can be empty if it's just an attachment
                isFromAdmin,
                createdAt: serverTimestamp(),
                read: false,
                ...(metadata && { metadata }), // Store optional metadata (e.g., product info)
                ...(attachment && { attachment }) // Store optional attachment { type: 'image'|'audio', url: string }
            });

            // Update conversation metadata
            const convRef = doc(db, COLLECTION_NAME, conversationId);
            const updateData = {
                lastMessageAt: serverTimestamp(),
                [isFromAdmin ? 'unreadByUser' : 'unreadByAdmin']: 1 // Increment unread
            };

            // Update last message text preview
            if (attachment) {
                updateData.lastMessage = attachment.type === 'image' ? '📷 Зураг' : '🎤 Дуут мессеж';
            } else if (message) {
                updateData.lastMessage = message.substring(0, 100);
            }

            // If user sends a message manually (not automated product inquiry), likely needs admin
            // However, we'll let specific UI actions trigger 'needsAdmin' explicitly for now to be safe,
            // OR we could say any manual text from user sets needsAdmin = true.
            // For now, let's keep it explicit via markAsNeedsAdmin to avoid AI chat noise.

            await updateDoc(convRef, updateData);

            return true;
        } catch (error) {
            console.error("Error sending message:", error);
            throw error;
        }
    },

    // Subscribe to messages in a conversation
    subscribeToMessages(conversationId, callback, limitCount = 50) {
        const messagesRef = collection(db, COLLECTION_NAME, conversationId, 'messages');
        // Fetch LAST N messages (descending), then reverse them for display
        const q = query(messagesRef, orderBy('createdAt', 'desc'), limit(limitCount));

        return onSnapshot(q, (snapshot) => {
            const messages = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt?.toDate?.() || new Date()
            }));
            // Reverse to show oldest -> newest
            callback(messages.reverse());
        });
    },

    // Mark messages as read
    async markAsRead(conversationId, isAdmin = false) {
        try {
            const convRef = doc(db, COLLECTION_NAME, conversationId);
            await updateDoc(convRef, {
                [isAdmin ? 'unreadByAdmin' : 'unreadByUser']: 0
            });
        } catch (error) {
            console.error("Error marking as read:", error);
        }
    },

    // Mark conversation as needing admin attention
    async markAsNeedsAdmin(conversationId) {
        try {
            const convRef = doc(db, COLLECTION_NAME, conversationId);
            await updateDoc(convRef, {
                needsAdmin: true,
                unreadByAdmin: 1 // Ensure it shows up as unread/active
            });
            return true;
        } catch (error) {
            console.error("Error marking as needs admin:", error);
            throw error;
        }
    },

    // Get all conversations (for admin)
    // Get all conversations (for admin)
    async getAllConversations() {
        try {
            // Filter: Only show conversations where users requested admin support
            // NOTE: Combined where() and orderBy() requires an index. 
            // Only using where() here and sorting in JS to avoid index requirement.
            const q = query(
                collection(db, COLLECTION_NAME),
                where('needsAdmin', '==', true)
            );
            const snapshot = await getDocs(q);
            const convs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Client-side sort
            return convs.sort((a, b) => {
                const tA = a.lastMessageAt?.toMillis?.() || 0;
                const tB = b.lastMessageAt?.toMillis?.() || 0;
                return tB - tA; // Descending
            });
        } catch (error) {
            console.error("Error fetching conversations:", error);
            return [];
        }
    },

    // Toggle pin status of a message
    async togglePinMessage(conversationId, messageId, isPinned) {
        try {
            const messageRef = doc(db, COLLECTION_NAME, conversationId, 'messages', messageId);
            await updateDoc(messageRef, {
                pinned: isPinned
            });
            return true;
        } catch (error) {
            console.error("Error pinning message:", error);
            throw error;
        }
    },

    // Toggle like status of a message
    async toggleLikeMessage(conversationId, messageId, isLiked) {
        try {
            const messageRef = doc(db, COLLECTION_NAME, conversationId, 'messages', messageId);
            await updateDoc(messageRef, {
                liked: isLiked
            });
            return true;
        } catch (error) {
            console.error("Error liking message:", error);
            throw error;
        }
    }
};
