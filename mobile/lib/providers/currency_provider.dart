import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

class CurrencyProvider extends ChangeNotifier {
  bool _isMnt = true;
  double _wonRate = 2.45; // Default fallback rate

  CurrencyProvider() {
    _initRateListener();
  }

  bool get isMnt => _isMnt;
  double get wonRate => _wonRate;

  void _initRateListener() {
    FirebaseFirestore.instance
        .collection('settings')
        .doc('currency')
        .snapshots()
        .listen((snapshot) {
      if (snapshot.exists && snapshot.data() != null) {
        final data = snapshot.data()!;
        if (data.containsKey('wonRate')) {
          _wonRate = (data['wonRate'] as num).toDouble();
          notifyListeners();
        }
      }
    }, onError: (e) {
      debugPrint("Error fetching currency rate: $e");
    });
  }

  void setCurrency(bool isMnt) {
    _isMnt = isMnt;
    notifyListeners();
  }

  void toggleCurrency() {
    _isMnt = !_isMnt;
    notifyListeners();
  }

  String formatPrice(int krw) {
    int price = _isMnt ? (krw * _wonRate).round() : krw;
    String symbol = _isMnt ? '₮' : '₩';

    return "${_formatNumber(price)} $symbol";
  }

  String _formatNumber(int number) {
    if (number == 0) return '0';
    final parts = number.toString().split('');
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
