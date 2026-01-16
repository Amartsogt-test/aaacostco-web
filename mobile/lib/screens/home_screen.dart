import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:provider/provider.dart';
import 'product_details_screen.dart';
import '../models/product.dart';
import '../services/product_service.dart';
import '../providers/currency_provider.dart';
import 'chat_screen.dart';
import 'menu_screen.dart';
import 'cart_screen.dart';
import 'rates_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _currentIndex = 0;

  // Placeholder for user info
  final String _currentUserId = "99887766";
  final String _currentUserName = "Bilguun";

  final List<Widget> _screens = [];

  @override
  void initState() {
    super.initState();
    _screens.addAll([
      const HomeContent(), // 0: Home
      const MenuScreen(), // 1: Menu
      ChatScreen(userId: _currentUserId, userName: _currentUserName), // 2: Chat
      const CartScreen(), // 3: Cart
      const RatesScreen(), // 4: Rates
    ]);
  }

  void _onTabTapped(int index) {
    setState(() {
      _currentIndex = index;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _currentIndex,
        children: _screens,
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: _onTabTapped,
        type: BottomNavigationBarType.fixed,
        selectedItemColor: const Color(0xFFE31837), // Costco Red
        unselectedItemColor: Colors.grey,
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.home),
            label: 'Home',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.menu),
            label: 'Цэс',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.chat),
            label: 'Чат',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.shopping_cart),
            label: 'Сагс',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.currency_exchange),
            label: 'Ханш',
          ),
        ],
      ),
    );
  }
}

class HomeContent extends StatefulWidget {
  const HomeContent({super.key});

  @override
  State<HomeContent> createState() => _HomeContentState();
}

class _HomeContentState extends State<HomeContent> {
  final ProductService _productService = ProductService();
  final TextEditingController _searchController = TextEditingController();
  String _selectedTag = 'All';
  String _searchQuery = '';
  bool _isAscending = true;

  @override
  Widget build(BuildContext context) {
    return Consumer<CurrencyProvider>(
      builder: (context, currency, _) => Scaffold(
        backgroundColor: Colors.white,
        body: StreamBuilder<List<Product>>(
          stream:
              _productService.getHomeProducts(tag: 'All'), // Fetch ALL to count
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              return Center(child: Text('Error: ${snapshot.error}'));
            }

            final allProducts = snapshot.data ?? [];

            // Calculate Counts
            final counts = {
              'Sale': allProducts
                  .where((p) =>
                      p.additionalCategories.contains('Sale') || p.hasDiscount)
                  .length,
              'New': allProducts
                  .where((p) => p.additionalCategories.contains('New'))
                  .length,
              'Kirkland': allProducts
                  .where((p) =>
                      p.additionalCategories.contains('Kirkland') ||
                      p.additionalCategories.contains('Kirkland Signature'))
                  .length,
              'Featured': allProducts
                  .where((p) => p.additionalCategories.contains('Featured'))
                  .length,
            };

            // Filter for Display
            final filteredProducts = _selectedTag == 'All'
                ? allProducts
                : allProducts
                    .where((p) =>
                        p.additionalCategories.contains(_selectedTag) ||
                        (_selectedTag == 'Sale' && p.hasDiscount) ||
                        (_selectedTag == 'Kirkland' &&
                            p.additionalCategories
                                .contains('Kirkland Signature')))
                    .toList();

            // Search Filter
            final displayProducts = filteredProducts.where((p) {
              if (_searchQuery.isEmpty) return true;
              final query = _searchQuery.toLowerCase();
              final nameEn = (p.name).toLowerCase();
              final nameMn = (p.nameMn ?? p.name).toLowerCase();
              return nameEn.contains(query) || nameMn.contains(query);
            }).toList();

            // Sort
            displayProducts.sort((a, b) {
              return _isAscending
                  ? a.price.compareTo(b.price)
                  : b.price.compareTo(a.price);
            });

            if (displayProducts.isEmpty) {
              // Even if empty, we want to show the filter bar so users can switch back
              return Column(
                children: [
                  Expanded(
                      child: const Center(child: Text('Бараа олдсонгүй.'))),
                  _buildSearchBar(currency),
                  _buildFilterBar(counts),
                ],
              );
            }

            return Column(children: [
              Expanded(
                child: GridView.builder(
                  padding: const EdgeInsets.all(12),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    childAspectRatio: 0.68,
                    crossAxisSpacing: 10,
                    mainAxisSpacing: 10,
                  ),
                  itemCount: displayProducts.length,
                  itemBuilder: (context, index) {
                    final product = displayProducts[index];
                    return _buildProductCard(context, product);
                  },
                ),
              ),
              _buildSearchBar(currency),
              _buildFilterBar(counts),
            ]);
          },
        ),
      ),
    );
  }

  Widget _buildSearchBar(CurrencyProvider currency) {
    return Container(
      height: 50,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: Colors.grey[100]!)),
      ),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _searchController,
              onChanged: (val) {
                setState(() {
                  _searchQuery = val;
                });
              },
              decoration: InputDecoration(
                isDense: true,
                hintText: 'Бараа хайх...',
                hintStyle: const TextStyle(fontSize: 14),
                prefixIcon:
                    const Icon(Icons.search, color: Colors.grey, size: 20),
                contentPadding: EdgeInsets.zero,
                filled: true,
                fillColor: Colors.white,
                suffixIcon: _searchQuery.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.close,
                            color: Colors.grey, size: 18),
                        onPressed: () {
                          _searchController.clear();
                          setState(() {
                            _searchQuery = '';
                          });
                        },
                      )
                    : null,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(20),
                  borderSide: BorderSide(color: Colors.grey[300]!),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(20),
                  borderSide: BorderSide(color: Colors.grey[300]!),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(20),
                  borderSide: const BorderSide(color: Color(0xFFE31837)),
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          // Price Sort Toggle
          IconButton(
            onPressed: () {
              setState(() {
                _isAscending = !_isAscending;
              });
            },
            icon: Icon(
              _isAscending ? Icons.arrow_upward : Icons.arrow_downward,
              size: 20,
              color: const Color(0xFFE31837),
            ),
            constraints: const BoxConstraints(),
            padding: EdgeInsets.zero,
            tooltip: _isAscending ? 'Үнэ өсөхөөр' : 'Үнэ буурахаар',
          ),
          const SizedBox(width: 12),
          // Interactive Currency Toggle
          GestureDetector(
            onTap: () => currency.toggleCurrency(),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(20),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.05),
                    blurRadius: 4,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    '1₩ = ${currency.wonRate}₮',
                    style: const TextStyle(
                      color: Color(0xFFE31837),
                      fontWeight: FontWeight.bold,
                      fontSize: 12, // Slightly smaller to fit
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterBar(Map<String, int> counts) {
    final filters = [
      {'id': 'New', 'label': 'Шинэ', 'icon': Icons.local_offer}, // Tag icon
      {'id': 'Sale', 'label': 'Sale', 'icon': Icons.percent},
      {
        'id': 'Kirkland',
        'label': 'Kirkland',
        'icon': Icons.verified_user
      }, // 'K' replacement
      {
        'id': 'Featured',
        'label': 'Онцгой',
        'icon': Icons.whatshot
      }, // Flame icon
    ];

    return Container(
      height: 50,
      padding: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: Colors.grey[100]!)),
      ),
      child: Row(
        children: [
          Expanded(
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              itemCount: filters.length,
              itemBuilder: (context, index) {
                final f = filters[index];
                final isSelected = _selectedTag == f['id'];

                final count = counts[f['id']] ?? 0;
                final label = '${f['label']} ($count)';

                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: FilterChip(
                    label: Text(label,
                        style: TextStyle(
                            color: isSelected ? Colors.white : Colors.black87,
                            fontSize: 12,
                            fontWeight: FontWeight.bold)),
                    selected: isSelected,
                    onSelected: (val) {
                      setState(() {
                        if (val) {
                          _selectedTag = f['id'] as String;
                        } else {
                          _selectedTag = 'All'; // Default back to showing all
                        }
                      });
                    },
                    backgroundColor: Colors.white,
                    selectedColor: const Color(0xFFE31837),
                    checkmarkColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(20),
                        side: BorderSide(
                            color: isSelected
                                ? const Color(0xFFE31837)
                                : Colors.grey[300]!)),
                    avatar: Icon(f['icon'] as IconData,
                        size: 14,
                        color: isSelected ? Colors.white : Colors.grey[600]),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildProductCard(BuildContext context, Product product) {
    return GestureDetector(
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => ProductDetailsScreen(product: product),
          ),
        );
      },
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.grey[200]!),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.02),
              blurRadius: 5,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Image with Badges
            Expanded(
              child: ClipRRect(
                borderRadius:
                    const BorderRadius.vertical(top: Radius.circular(12)),
                child: Stack(
                  children: [
                    product.imageUrl.isEmpty
                        ? Container(
                            color: Colors.grey[100],
                            child: const Icon(Icons.image, color: Colors.grey))
                        : CachedNetworkImage(
                            imageUrl: product.imageUrl,
                            width: double.infinity,
                            fit: BoxFit.contain, // Better for product images
                            placeholder: (_, __) =>
                                Container(color: Colors.grey[100]),
                            errorWidget: (_, __, ___) => Container(
                                color: Colors.grey[100],
                                child: const Icon(Icons.error)),
                          ),
                    // Badges (Sale, New, Costco Logo)
                    Positioned(
                      top: 4,
                      right: 4,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 4, vertical: 2),
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.9),
                          borderRadius: BorderRadius.circular(4),
                          border: Border.all(color: Colors.red[100]!),
                        ),
                        child: const Text('COSTCO',
                            style: TextStyle(
                                color: Color(0xFFE31837),
                                fontSize: 8,
                                fontWeight: FontWeight.w900)),
                      ),
                    ),
                    if (product.hasDiscount)
                      Positioned(
                        top: 4,
                        left: 4,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 4, vertical: 2),
                          decoration: BoxDecoration(
                            color: const Color(0xFFE31837),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: const Text('SALE',
                              style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 8,
                                  fontWeight: FontWeight.bold)),
                        ),
                      ),
                    if (product.additionalCategories.contains('New'))
                      Positioned(
                        top: product.hasDiscount ? 20 : 4,
                        left: 4,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 4, vertical: 2),
                          decoration: BoxDecoration(
                            color: Colors.blue[600],
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: const Text('NEW',
                              style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 8,
                                  fontWeight: FontWeight.bold)),
                        ),
                      ),
                  ],
                ),
              ),
            ),
            // Product Info
            Padding(
              padding: const EdgeInsets.all(8.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    product.displayName,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      height: 1.2,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Consumer<CurrencyProvider>(
                    builder: (context, currency, _) {
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (product.originalPrice != null &&
                              product.originalPrice! > product.price)
                            Text(
                              currency.formatPrice(product.originalPrice!),
                              style: TextStyle(
                                fontSize: 10,
                                decoration: TextDecoration.lineThrough,
                                color: Colors.grey[400],
                              ),
                            ),
                          Text(
                            currency.formatPrice(product.price),
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.bold,
                              color: Color(0xFFE31837),
                            ),
                          ),
                        ],
                      );
                    },
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
