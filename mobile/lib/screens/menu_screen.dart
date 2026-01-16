import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cached_network_image/cached_network_image.dart';

class MenuScreen extends StatelessWidget {
  const MenuScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: StreamBuilder<QuerySnapshot>(
          stream:
              FirebaseFirestore.instance.collection('categories').snapshots(),
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasData) {
              debugPrint(
                  'MenuScreen: Found ${snapshot.data!.docs.length} categories');
            } else {
              debugPrint('MenuScreen: No data or error: ${snapshot.error}');
            }

            final List<Map<String, dynamic>> displayData =
                snapshot.hasData && snapshot.data!.docs.isNotEmpty
                    ? snapshot.data!.docs.map((doc) {
                        final data = doc.data() as Map<String, dynamic>;
                        return {
                          'id': doc.id,
                          'label': data['label'] ?? 'No Name',
                          'iconName': data['iconName'],
                          'icon': _getIconFromName(data['iconName']),
                          'banner': data['imageUrl'],
                        };
                      }).toList()
                    : [];

            if (displayData.isEmpty) {
              return const Center(child: Text('Ангилал олдсонгүй.'));
            }

            return GridView.builder(
              padding: const EdgeInsets.all(16),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                childAspectRatio: 0.85,
                crossAxisSpacing: 16,
                mainAxisSpacing: 16,
              ),
              itemCount: displayData.length,
              itemBuilder: (context, index) {
                final item = displayData[index];
                return GestureDetector(
                  onTap: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Selected: ${item['label']}')),
                    );
                  },
                  child: Container(
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.1),
                          blurRadius: 10,
                          offset: const Offset(0, 4),
                        ),
                      ],
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          // Background Image
                          CachedNetworkImage(
                            imageUrl: item['banner'] ?? '',
                            fit: BoxFit.cover,
                            placeholder: (context, url) => Container(
                              color: Colors.grey[100],
                              child: const Center(
                                child:
                                    CircularProgressIndicator(strokeWidth: 2),
                              ),
                            ),
                            errorWidget: (context, url, error) => Container(
                              color: Colors.grey[100],
                              child: Center(
                                child: Icon(
                                  item['icon'] ?? Icons.image,
                                  size: 40,
                                  color: Colors.grey[400],
                                ),
                              ),
                            ),
                          ),

                          // Overlay Gradient
                          Container(
                            decoration: BoxDecoration(
                              gradient: LinearGradient(
                                begin: Alignment.topCenter,
                                end: Alignment.bottomCenter,
                                colors: [
                                  Colors.transparent,
                                  Colors.black.withOpacity(0.7),
                                ],
                                stops: const [0.5, 1.0],
                              ),
                            ),
                          ),

                          // Content
                          Padding(
                            padding: const EdgeInsets.all(12.0),
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.end,
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Icon(item['icon'],
                                    color: Colors.white, size: 24),
                                const SizedBox(height: 8),
                                Text(
                                  item['label'],
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.bold,
                                    fontSize: 14,
                                  ),
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }

  // Helper to map icon names (from DB) to Icons
  IconData _getIconFromName(String? iconName) {
    if (iconName == null) return Icons.category;
    switch (iconName) {
      case 'Monitor':
        return Icons.monitor;
      case 'Grid':
        return Icons.grid_view;
      case 'Home':
        return Icons.home;
      case 'Coffee':
        return Icons.coffee;
      case 'Baby':
        return Icons.child_care;
      case 'Sun':
        return Icons.wb_sunny;
      case 'Umbrella':
        return Icons.umbrella;
      case 'ShoppingBag':
        return Icons.shopping_bag;
      case 'Watch':
        return Icons.watch;
      case 'Scissors':
        return Icons.content_cut;
      case 'Heart':
        return Icons.favorite;
      case 'Wrench':
        return Icons.build;
      case 'Utensils':
        return Icons.restaurant;
      case 'Briefcase':
        return Icons.work;
      default:
        return Icons.category;
    }
  }
}
