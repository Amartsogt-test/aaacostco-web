import 'package:cloud_firestore/cloud_firestore.dart';

class ChatService {
  final FirebaseFirestore _db = FirebaseFirestore.instance;
  static const String COLLECTION_NAME = 'chats';

  // 1. Get or create a conversation for a user
  Future<String> getOrCreateConversation(String userId, String userName) async {
    try {
      // Check if conversation exists
      final snapshot = await _db
          .collection(COLLECTION_NAME)
          .where('userId', isEqualTo: userId)
          .limit(1)
          .get();

      if (snapshot.docs.isNotEmpty) {
        return snapshot.docs.first.id;
      }

      // Create new conversation
      final docRef = await _db.collection(COLLECTION_NAME).add({
        'userId': userId,
        'userName': userName.isNotEmpty ? userName : 'Guest',
        'createdAt': FieldValue.serverTimestamp(),
        'lastMessage': null,
        'lastMessageAt': FieldValue.serverTimestamp(),
        'unreadByAdmin': 0,
        'unreadByUser': 0,
      });

      return docRef.id;
    } catch (e) {
      print("Error getting/creating conversation: $e");
      rethrow;
    }
  }

  // 2. Send a message
  Future<void> sendMessage(String conversationId, String message,
      {Map<String, dynamic>? metadata,
      Map<String, dynamic>? attachment}) async {
    try {
      // Add message to subcollection
      await _db
          .collection(COLLECTION_NAME)
          .doc(conversationId)
          .collection('messages')
          .add({
        'text': message,
        'isFromAdmin': false,
        'createdAt': FieldValue.serverTimestamp(),
        'read': false,
        if (metadata != null) 'metadata': metadata,
        if (attachment != null) 'attachment': attachment,
      });

      // Update conversation metadata
      String? lastMsgPreview = message;

      // Handle attachment preview text
      if (attachment != null) {
        final type = attachment['type'];
        if (type == 'image') {
          lastMsgPreview = '📷 Зураг';
        } else if (type == 'audio') {
          lastMsgPreview = '🎤 Дуут мессеж';
        }
      }

      // If message is too long, truncate it
      if (lastMsgPreview.length > 100) {
        lastMsgPreview = lastMsgPreview.substring(0, 100);
      }

      await _db.collection(COLLECTION_NAME).doc(conversationId).update({
        'lastMessage': lastMsgPreview,
        'lastMessageAt': FieldValue.serverTimestamp(),
        'unreadByAdmin': FieldValue.increment(1),
      });
    } catch (e) {
      print("Error sending message: $e");
      rethrow;
    }
  }

  // 3. Subscribe to messages
  Stream<QuerySnapshot> getMessages(String conversationId) {
    return _db
        .collection(COLLECTION_NAME)
        .doc(conversationId)
        .collection('messages')
        .orderBy('createdAt',
            descending:
                false) // Chat UI usually needs oldest first, or newest first depending on List view
        .snapshots();
  }

  // 4. Mark messages as read
  Future<void> markAsRead(String conversationId) async {
    try {
      await _db.collection(COLLECTION_NAME).doc(conversationId).update({
        'unreadByUser': 0,
      });
    } catch (e) {
      print("Error marking as read: $e");
    }
  }

  // 5. Send Admin Message (For Bot/Auto-reply)
  Future<void> sendAdminMessage(String conversationId, String message) async {
    try {
      await _db
          .collection(COLLECTION_NAME)
          .doc(conversationId)
          .collection('messages')
          .add({
        'text': message,
        'isFromAdmin': true,
        'createdAt': FieldValue.serverTimestamp(),
        'read': false,
      });

      await _db.collection(COLLECTION_NAME).doc(conversationId).update({
        'lastMessage': message,
        'lastMessageAt': FieldValue.serverTimestamp(),
        'unreadByUser': FieldValue.increment(1),
      });
    } catch (e) {
      print("Error sending admin message: $e");
      rethrow;
    }
  }
}
