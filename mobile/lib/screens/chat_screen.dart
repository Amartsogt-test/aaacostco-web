import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../services/chat_service.dart';
import '../models/product.dart';
import 'package:provider/provider.dart';
import '../providers/currency_provider.dart';

class ChatScreen extends StatefulWidget {
  final String userId;
  final String userName;
  final Product? product; // Optional: If coming from Product Details

  const ChatScreen({
    super.key,
    required this.userId,
    required this.userName,
    this.product,
  });

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final ChatService _chatService = ChatService();
  final TextEditingController _controller = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  String? _conversationId;
  bool _isLoading = true;
  bool _hasSentInquiry = false; // Prevent double sending

  @override
  void initState() {
    super.initState();
    _initializeChat();
  }

  Future<void> _initializeChat() async {
    try {
      final id = await _chatService.getOrCreateConversation(
        widget.userId,
        widget.userName,
      );

      if (mounted) {
        setState(() {
          _conversationId = id;
          _isLoading = false;
        });

        // If a product is passed and we haven't sent an inquiry yet
        if (widget.product != null && !_hasSentInquiry) {
          _handleProductInquiry(id);
        }
      }
    } catch (e) {
      print("Error init chat: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _handleProductInquiry(String conversationId) async {
    setState(() => _hasSentInquiry = true);

    final product = widget.product!;

    // 1. Send Product Card / Inquiry Message as USER
    // Metadata helps the UI render a product card
    await _chatService
        .sendMessage(conversationId, "", // Empty text, just product metadata
            metadata: {
          'type': 'product',
          'productId': product.id,
          'productName': product.name,
          'productImage': product.imageUrl,
          'productPrice': product.price,
        });

    // 2. Simulate User asking "Энэ барааны талаар мэдээлэл авъя" (Optional, or combined above)
    // Let's just assume the metadata message is enough or send a text along with it.
    // For this implementation, we will send a separate text text if needed, but let's stick to the metadata one being the "Action".

    // 3. Simulate ADMIN Auto-reply
    await Future.delayed(const Duration(seconds: 1));
    if (!mounted) return;

    const autoReply =
        "Сайн байна уу?\n\nCostco-ийн онлайн болон салбар дэлгүүрийн үнэ харилцан адилгүй байх тохиолдол гардаг.\n- Зарим бараа онлайнд, зарим нь дэлгүүртээ хямд байдаг.\n- Бид танд аль хямд үнийн дүнгээр нь тооцож өгөх болно.\n-------------------\nУучлаарай, одоогоор ачаалалтай байгаа тул танд удахгүй хариу бичье. Та асуух зүйлээ энд бичээд үлдээгээрэй. Баярлалаа.";

    await _chatService.sendAdminMessage(conversationId, autoReply);
  }

  void _sendMessage() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _conversationId == null) return;

    _controller.clear();
    try {
      await _chatService.sendMessage(_conversationId!, text);
      _scrollToBottom();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("Error sending message: $e")),
      );
    }
  }

  void _scrollToBottom() {
    // Only scroll if we are reasonably sure list is loaded
    if (_scrollController.hasClients) {
      // Small delay to allow list update
      Future.delayed(const Duration(milliseconds: 100), () {
        if (_scrollController.hasClients) {
          _scrollController.animateTo(
            _scrollController.position.maxScrollExtent,
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeOut,
          );
        }
      });
    }
  }

  String _formatTimestamp(dynamic timestamp) {
    if (timestamp == null) return '';
    DateTime date;
    if (timestamp is Timestamp) {
      date = timestamp.toDate();
    } else if (timestamp is int) {
      date = DateTime.fromMillisecondsSinceEpoch(timestamp);
    } else {
      return '';
    }
    return "${date.hour}:${date.minute.toString().padLeft(2, '0')}";
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Чат', style: TextStyle(color: Colors.black)),
        backgroundColor: Colors.white,
        elevation: 1,
        iconTheme: const IconThemeData(color: Colors.black),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                Expanded(
                  child: StreamBuilder<QuerySnapshot>(
                    stream: _chatService.getMessages(_conversationId!),
                    builder: (context, snapshot) {
                      if (snapshot.hasError) {
                        return Center(child: Text('Error: ${snapshot.error}'));
                      }
                      if (!snapshot.hasData) {
                        return const Center(child: CircularProgressIndicator());
                      }

                      final docs = snapshot.data!.docs;

                      // Auto scroll logic could go here or using a reverse list view is often better for Chat

                      if (docs.isEmpty) {
                        return const Center(
                            child: Text('Мессеж байхгүй байна.'));
                      }

                      return ListView.builder(
                        controller: _scrollController,
                        padding: const EdgeInsets.all(16),
                        itemCount: docs.length,
                        itemBuilder: (context, index) {
                          final data =
                              docs[index].data() as Map<String, dynamic>;
                          final isMe = !(data['isFromAdmin'] ?? false);
                          final isSystem = data['isFromAdmin'] ?? false;
                          final metadata =
                              data['metadata'] as Map<String, dynamic>?;

                          return Padding(
                            padding: const EdgeInsets.symmetric(vertical: 4),
                            child: Column(
                              crossAxisAlignment: isMe
                                  ? CrossAxisAlignment.end
                                  : CrossAxisAlignment.start,
                              children: [
                                if (isSystem)
                                  Padding(
                                    padding: const EdgeInsets.only(
                                        left: 8, bottom: 4),
                                    child: Row(
                                      children: [
                                        Container(
                                          padding: const EdgeInsets.symmetric(
                                              horizontal: 6, vertical: 2),
                                          decoration: BoxDecoration(
                                            color: const Color(0xFFE31837),
                                            borderRadius:
                                                BorderRadius.circular(4),
                                          ),
                                          child: const Text(
                                            'OFFICIAL',
                                            style: TextStyle(
                                                color: Colors.white,
                                                fontSize: 8,
                                                fontWeight: FontWeight.bold),
                                          ),
                                        ),
                                        const SizedBox(width: 4),
                                        const Text(
                                          'Costco Admin',
                                          style: TextStyle(
                                              color: Colors.grey,
                                              fontSize: 10,
                                              fontWeight: FontWeight.bold),
                                        ),
                                      ],
                                    ),
                                  ),
                                Align(
                                  alignment: isMe
                                      ? Alignment.centerRight
                                      : Alignment.centerLeft,
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 16,
                                      vertical: 10,
                                    ),
                                    constraints: BoxConstraints(
                                        maxWidth:
                                            MediaQuery.of(context).size.width *
                                                0.75),
                                    decoration: BoxDecoration(
                                      color: isMe
                                          ? const Color(
                                              0xFF0060A9) // Costco Blue
                                          : const Color(0xFFF8F9FA),
                                      borderRadius: BorderRadius.only(
                                        topLeft: const Radius.circular(16),
                                        topRight: const Radius.circular(16),
                                        bottomLeft: isMe
                                            ? const Radius.circular(16)
                                            : Radius.zero,
                                        bottomRight: isMe
                                            ? Radius.zero
                                            : const Radius.circular(16),
                                      ),
                                      border: isMe
                                          ? null
                                          : Border.all(
                                              color: const Color(0xFFE0E0E0)),
                                      boxShadow: [
                                        if (!isMe)
                                          BoxShadow(
                                            color:
                                                Colors.black.withOpacity(0.05),
                                            blurRadius: 5,
                                            offset: const Offset(0, 2),
                                          ),
                                      ],
                                    ),
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        // Product Card in Chat
                                        if (metadata != null &&
                                            metadata['type'] == 'product')
                                          Consumer<CurrencyProvider>(
                                            builder: (context, currency, _) =>
                                                Container(
                                              margin: const EdgeInsets.only(
                                                  bottom: 8),
                                              padding: const EdgeInsets.all(8),
                                              decoration: BoxDecoration(
                                                color: Colors.white,
                                                borderRadius:
                                                    BorderRadius.circular(8),
                                                border: Border.all(
                                                    color: Colors.grey[200]!),
                                              ),
                                              child: Column(
                                                crossAxisAlignment:
                                                    CrossAxisAlignment.start,
                                                children: [
                                                  if (metadata[
                                                          'productImage'] !=
                                                      null)
                                                    ClipRRect(
                                                      borderRadius:
                                                          BorderRadius.circular(
                                                              4),
                                                      child: Image.network(
                                                        metadata[
                                                            'productImage'],
                                                        height: 120,
                                                        width: double.infinity,
                                                        fit: BoxFit.contain,
                                                        errorBuilder: (c, e,
                                                                s) =>
                                                            const Icon(
                                                                Icons
                                                                    .broken_image,
                                                                size: 50,
                                                                color: Colors
                                                                    .grey),
                                                      ),
                                                    ),
                                                  const SizedBox(height: 8),
                                                  Text(
                                                    metadata['productName'] ??
                                                        'Бараа',
                                                    style: const TextStyle(
                                                        fontWeight:
                                                            FontWeight.bold,
                                                        fontSize: 13,
                                                        color: Colors.black),
                                                    maxLines: 2,
                                                    overflow:
                                                        TextOverflow.ellipsis,
                                                  ),
                                                  const SizedBox(height: 4),
                                                  Text(
                                                    currency.formatPrice(metadata[
                                                            'productPrice'] ??
                                                        0),
                                                    style: const TextStyle(
                                                        color:
                                                            Color(0xFFE31837),
                                                        fontWeight:
                                                            FontWeight.w900,
                                                        fontSize: 14),
                                                  ),
                                                ],
                                              ),
                                            ),
                                          ),

                                        // Attachment Image
                                        if (data['attachment'] != null &&
                                            data['attachment']['type'] ==
                                                'image')
                                          Padding(
                                            padding: const EdgeInsets.only(
                                                bottom: 8.0),
                                            child: ClipRRect(
                                              borderRadius:
                                                  BorderRadius.circular(8),
                                              child: Image.network(
                                                data['attachment']['url'],
                                                height: 150,
                                                fit: BoxFit.cover,
                                              ),
                                            ),
                                          ),

                                        // Normal Text
                                        if (data['text'] != null &&
                                            data['text'].toString().isNotEmpty)
                                          Text(
                                            data['text'],
                                            style: TextStyle(
                                              color: isMe
                                                  ? Colors.white
                                                  : Colors.black87,
                                              fontSize: 14,
                                              height: 1.4,
                                            ),
                                          ),
                                        // Add Timestamp
                                        if (data['timestamp'] != null)
                                          Padding(
                                            padding:
                                                const EdgeInsets.only(top: 4),
                                            child: Text(
                                              _formatTimestamp(
                                                  data['timestamp']),
                                              style: TextStyle(
                                                color: isMe
                                                    ? Colors.white70
                                                    : Colors.grey[500],
                                                fontSize: 10,
                                              ),
                                            ),
                                          ),
                                      ],
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          );
                        },
                      );
                    },
                  ),
                ),
                SafeArea(
                  child: Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      boxShadow: [
                        BoxShadow(
                          color: Colors.grey.withOpacity(0.1),
                          spreadRadius: 1,
                          blurRadius: 3,
                          offset: const Offset(0, -1),
                        ),
                      ],
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _controller,
                            decoration: const InputDecoration(
                              hintText: 'Мессеж бичих...',
                              border: InputBorder.none,
                              contentPadding:
                                  EdgeInsets.symmetric(horizontal: 16),
                            ),
                            onSubmitted: (_) => _sendMessage(),
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.send, color: Colors.blue),
                          onPressed: _sendMessage,
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}
