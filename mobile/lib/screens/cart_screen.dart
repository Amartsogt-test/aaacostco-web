import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

class CartScreen extends StatefulWidget {
  const CartScreen({super.key});

  @override
  State<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends State<CartScreen> {
  double _progress = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Stack(
          children: [
            InAppWebView(
              initialUrlRequest: URLRequest(
                url: WebUri("https://costco-fe034.web.app/cart"),
              ),
              initialSettings: InAppWebViewSettings(
                useShouldOverrideUrlLoading: true,
                mediaPlaybackRequiresUserGesture: false,
                useHybridComposition: false,
                allowsInlineMediaPlayback: true,
              ),
              onProgressChanged: (controller, progress) {
                setState(() {
                  _progress = progress / 100;
                });
              },
              onLoadStop: (controller, url) async {
                // Inject CSS to hide header and footer aggressively
                await controller.injectCSSCode(source: """
                /* Hide all common header/nav/footer elements */
                header, nav, footer, 
                .header, .navbar, .footer, 
                #header, #navbar, #footer,
                [class*="header"], [class*="navbar"], [class*="footer"],
                .fixed-top, .fixed-bottom,
                /* Specific React/Common Layout classes */
                .Nav_container__1a2b3, /* Example of hashed class if known */
                .sticky, .top-0 { 
                  display: none !important; 
                  height: 0 !important;
                  margin: 0 !important;
                  padding: 0 !important;
                  visibility: hidden !important;
                  pointer-events: none !important;
                }
                body {
                  padding-top: 0 !important;
                  margin-top: 0 !important;
                }
                /* Hide any potential overlap or spacer */
                div[style*="height: 60px"], div[style*="height: 70px"] {
                  display: none !important;
                }
              """);
              },
              onConsoleMessage: (controller, consoleMessage) {
                print("WEBVIEW CONSOLE: ${consoleMessage.message}");
              },
            ),
            if (_progress < 1.0)
              LinearProgressIndicator(
                  value: _progress, color: const Color(0xFFE31837)),
          ],
        ),
      ),
    );
  }
}
