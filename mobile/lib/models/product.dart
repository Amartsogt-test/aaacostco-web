class Product {
  final String id;
  final String name;
  final String? nameMn;
  final String imageUrl;
  final int price;
  final int? originalPrice;
  final bool hasDiscount;
  final String? status;
  final String? description;
  final List<String> additionalCategories;

  Product({
    required this.id,
    required this.name,
    this.nameMn,
    required this.imageUrl,
    required this.price,
    this.originalPrice,
    this.hasDiscount = false,
    this.status,
    this.description,
    this.additionalCategories = const [],
  });

  bool get isInactive => status == 'inactive' || status == 'deleted';

  String get displayName => nameMn ?? name;

  String formatPrice() {
    if (price == 0) return '0';
    final parts = price.toString().split('');
    String result = '';
    int count = 0;
    for (int i = parts.length - 1; i >= 0; i--) {
      if (count != 0 && count % 3 == 0) {
        result = ',$result';
      }
      result = parts[i] + result;
      count++;
    }
    return result;
  }
}
