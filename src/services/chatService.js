import { db, uploadFileToStorage } from '../firebase';
import { collection, addDoc, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp, where, getDocs, limit, increment, writeBatch } from 'firebase/firestore';

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
            return await uploadFileToStorage(path, file);
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
                [isFromAdmin ? 'unreadByUser' : 'unreadByAdmin']: increment(1) // Increment unread
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

    // Subscribe to conversation metadata (like unreadCount)
    subscribeToConversation(conversationId, callback) {
        const convRef = doc(db, COLLECTION_NAME, conversationId);
        return onSnapshot(convRef, (docSnap) => {
            if (docSnap.exists()) {
                callback({ id: docSnap.id, ...docSnap.data() });
            }
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
                unreadByAdmin: increment(1) // Increment unread count
            });
        } catch (error) {
            console.error("Error marking as needs admin:", error);
        }
    },

    // Broadcast a message to all users
    async broadcastMessage(text, imageFile = null) {
        try {
            let imageUrl = null;
            if (imageFile) {
                imageUrl = await uploadFileToStorage(`chats/broadcast/${Date.now()}_${imageFile.name}`, imageFile);
            }

            // Get all conversations
            const snapshot = await getDocs(collection(db, COLLECTION_NAME));
            if (snapshot.empty) return 0;

            const chunks = [];
            const docs = snapshot.docs;
            // Firestore batch limit is 500, we use 400 to be safe (each chat uses 2 ops: add message + update conv) -> 800 ops? Wait, limit is 500 OPERATIONS per batch. So 250 conversations = 500 ops.
            // Let's use chunks of 200 conversations (400 ops)
            for (let i = 0; i < docs.length; i += 200) {
                chunks.push(docs.slice(i, i + 200));
            }

            let totalSent = 0;
            for (const chunk of chunks) {
                const batch = writeBatch(db);
                for (const conversationDoc of chunk) {
                    const conversationId = conversationDoc.id;
                    
                    // 1. Add message document — MUST match the schema ChatModal renders
                    // (isFromAdmin + attachment), otherwise broadcasts show up as the
                    // user's own message and the image never appears.
                    const messageRef = doc(collection(db, COLLECTION_NAME, conversationId, 'messages'));
                    batch.set(messageRef, {
                        text: text || '',
                        isFromAdmin: true,
                        read: false,
                        isBroadcast: true,
                        createdAt: serverTimestamp(),
                        ...(imageUrl && { attachment: { type: 'image', url: imageUrl } })
                    });

                    // 2. Update conversation document
                    const convRef = doc(db, COLLECTION_NAME, conversationId);
                    batch.update(convRef, {
                        lastMessage: text || 'Зураг илгээлээ',
                        lastMessageAt: serverTimestamp(),
                        unreadByUser: increment(1)
                    });
                    
                    totalSent++;
                }
                await batch.commit();
            }

            return totalSent;
        } catch (error) {
            console.error("Error broadcasting message:", error);
            throw error;
        }
    },

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
