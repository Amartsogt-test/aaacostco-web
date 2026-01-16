import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/product.dart';
import '../providers/currency_provider.dart';
import 'chat_screen.dart';

class ProductDetailsScreen extends StatelessWidget {
  final Product product;

  // Hardcoded current user for demo - in real app, get from Auth Provider
  final String currentUserId = "99887766";
  final String currentUserName = "Bilguun";

  const ProductDetailsScreen({super.key, required this.product});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Барааны дэлгэрэнгүй',
            style: TextStyle(color: Colors.black)),
        backgroundColor: Colors.white,
        iconTheme: const IconThemeData(color: Colors.black),
        elevation: 0,
      ),
      body: Consumer<CurrencyProvider>(
        builder: (context, currency, _) => Column(
          children: [
            Expanded(
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Image.network(
                      product.imageUrl,
                      height: 300,
                      width: double.infinity,
                      fit: BoxFit.contain, // Better for product previews
                      errorBuilder: (c, e, s) => Container(
                          height: 300,
                          color: Colors.grey[200],
                          child: const Icon(Icons.image, size: 100)),
                    ),
                    Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            product.displayName,
                            style: const TextStyle(
                                fontSize: 20, fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 8),
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(
                                currency.formatPrice(product.price),
                                style: const TextStyle(
                                    fontSize: 26,
                                    color: Color(0xFFE31837),
                                    fontWeight: FontWeight.bold),
                              ),
                              if (product.originalPrice != null &&
                                  product.originalPrice! > product.price) ...[
                                const SizedBox(width: 8),
                                Text(
                                  currency.formatPrice(product.originalPrice!),
                                  style: const TextStyle(
                                      fontSize: 16,
                                      color: Colors.grey,
                                      decoration: TextDecoration.lineThrough),
                                ),
                              ],
                            ],
                          ),
                          const SizedBox(height: 16),
                          Text(
                            product.description ?? "Тайлбар байхгүй.",
                            style: const TextStyle(
                                fontSize: 16,
                                height: 1.5,
                                color: Colors.black54),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // Bottom Action Bar
            SafeArea(
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  boxShadow: [
                    BoxShadow(
                        color: Colors.black.withOpacity(0.05),
                        blurRadius: 10,
                        offset: const Offset(0, -5))
                  ],
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: () {
                          // Navigate to Chat with Product
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => ChatScreen(
                                userId: currentUserId,
                                userName: currentUserName,
                                product: product,
                              ),
                            ),
                          );
                        },
                        icon: const Icon(Icons.chat_bubble_outline),
                        label: const Text('Мэссэж бичих'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.blue,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 12),
                        ),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: () {},
                        icon: const Icon(Icons.shopping_cart),
                        label: const Text('Сагслах'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFFE31837),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 12),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
