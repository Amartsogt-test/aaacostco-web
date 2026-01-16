import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/product.dart';

class ProductService {
  final FirebaseFirestore _db = FirebaseFirestore.instance;

  // Fetch products for Home screen from 'home_products' collection
  Stream<List<Product>> getHomeProducts({String? tag}) {
    Query query = _db.collection('home_products');

    if (tag != null && tag != 'All') {
      query = query.where('additionalCategories', arrayContains: tag);
    }

    return query
        .orderBy('sortOrder', descending: false)
        .limit(500) // Changed from 1000 to 500 to test performance
        .snapshots()
        .map((snapshot) {
      return snapshot.docs.map((doc) {
        final data = doc.data() as Map<String, dynamic>;
        return Product(
          id: doc.id,
          name: data['name'] ?? '',
          nameMn: data['name_mn'],
          imageUrl: data['image'] ?? data['imageUrl'] ?? '',
          price: (data['price'] ?? 0).toInt(),
          originalPrice: (data['originalPrice'] ?? 0).toInt(),
          hasDiscount: data['hasDiscount'] ?? false,
          status: data['status'],
          description: data['description_mn'] ?? data['description'],
          additionalCategories:
              List<String>.from(data['additionalCategories'] ?? []),
        );
      }).toList();
    });
  }

  // Fetch products by category
  Stream<List<Product>> getProductsByCategory(String categoryCode) {
    return _db
        .collection('products')
        .where('status', isEqualTo: 'active')
        .where('category', isEqualTo: categoryCode)
        .orderBy('updatedAt', descending: true)
        .snapshots()
        .map((snapshot) {
      return snapshot.docs.map((doc) {
        final data = doc.data() as Map<String, dynamic>;
        return Product(
          id: doc.id,
          name: data['name'] ?? '',
          nameMn: data['name_mn'],
          imageUrl: data['image'] ?? data['imageUrl'] ?? '',
          price: (data['price'] ?? 0).toInt(),
          originalPrice: (data['originalPrice'] ?? 0).toInt(),
          hasDiscount: data['hasDiscount'] ?? false,
          status: data['status'],
          description: data['description_mn'] ?? data['description'],
          additionalCategories:
              List<String>.from(data['additionalCategories'] ?? []),
        );
      }).toList();
    });
  }
}
