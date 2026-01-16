import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/currency_provider.dart';

class RatesScreen extends StatefulWidget {
  const RatesScreen({super.key});

  @override
  State<RatesScreen> createState() => _RatesScreenState();
}

class _RatesScreenState extends State<RatesScreen> {
  @override
  Widget build(BuildContext context) {
    final currencyProvider = Provider.of<CurrencyProvider>(context);
    final double wonRate = currencyProvider.wonRate;

    String displayRate;
    String subText;

    if (currencyProvider.isMnt) {
      displayRate = "1 ₩ = $wonRate ₮";
      subText = "1 Вон $wonRate төгрөгтэй тэнцэж байна";
    } else {
      double reverseRate = 1 / wonRate;
      displayRate = "1 ₮ = ${reverseRate.toStringAsFixed(2)} ₩";
      subText =
          "1 Төгрөг ${reverseRate.toStringAsFixed(2)} вонтой тэнцэж байна";
    }

    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Icon
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: const Color(0xFFE31837).withOpacity(0.1),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.currency_exchange,
                      size: 60, color: Color(0xFFE31837)),
                ),
                const SizedBox(height: 30),

                // Rate Text
                Text(
                  displayRate,
                  style: const TextStyle(
                    fontSize: 32,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF0060A9),
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  subText,
                  style: const TextStyle(
                    fontSize: 14,
                    color: Colors.grey,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 40),

                // Toggle Button
                ElevatedButton.icon(
                  onPressed: () => currencyProvider.toggleCurrency(),
                  icon: const Icon(Icons.swap_horiz, color: Colors.white),
                  label: const Text("Солих (₩ / ₮)"),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF0060A9), // Costco Blue
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 32, vertical: 16),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(30)),
                  ),
                ),

                const SizedBox(height: 20),

                // Info Card
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: const Color(0xFFEBF6FA),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.blue.withOpacity(0.2)),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.info_outline, color: Color(0xFF0060A9)),
                      SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          "Энэ ханш нь Хаан Банкны бэлэн бус ханшаар тооцогдож байгаа болно.",
                          style:
                              TextStyle(color: Color(0xFF0060A9), fontSize: 13),
                        ),
                      ),
                    ],
                  ),
                )
              ],
            ),
          ),
        ),
      ),
    );
  }
}
