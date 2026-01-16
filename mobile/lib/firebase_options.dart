// File: lib/firebase_options.dart
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      return web;
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
        return ios;
      case TargetPlatform.macOS:
        return macos;
      case TargetPlatform.windows:
        return web; // Use Web config for Windows (works for Firestore/Auth basics)
      case TargetPlatform.linux:
        throw UnsupportedError(
          'DefaultFirebaseOptions have not been configured for linux - '
          'you can reconfigure this by running the FlutterFire CLI again.',
        );
      default:
        throw UnsupportedError(
          'DefaultFirebaseOptions are not supported for this platform.',
        );
    }
  }

  static const FirebaseOptions web = FirebaseOptions(
    apiKey: 'AIzaSyBbYbLxQicM3FaQhdo8tHOi_lR1d3hT88w',
    appId: '1:502636501812:web:6b5710919fe3b43783e361',
    messagingSenderId: '502636501812',
    projectId: 'costco-fe034',
    authDomain: 'costco-fe034.firebaseapp.com',
    storageBucket: 'costco-fe034.firebasestorage.app',
  );

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyBbYbLxQicM3FaQhdo8tHOi_lR1d3hT88w',
    appId:
        '1:502636501812:web:6b5710919fe3b43783e361', // Using Web App ID for now as generic fallback if generic android app id missing
    messagingSenderId: '502636501812',
    projectId: 'costco-fe034',
    storageBucket: 'costco-fe034.firebasestorage.app',
  );

  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: 'AIzaSyBbYbLxQicM3FaQhdo8tHOi_lR1d3hT88w',
    appId: '1:502636501812:web:6b5710919fe3b43783e361',
    messagingSenderId: '502636501812',
    projectId: 'costco-fe034',
    storageBucket: 'costco-fe034.firebasestorage.app',
  );

  static const FirebaseOptions macos = FirebaseOptions(
    apiKey: 'AIzaSyBbYbLxQicM3FaQhdo8tHOi_lR1d3hT88w',
    appId: '1:502636501812:web:6b5710919fe3b43783e361',
    messagingSenderId: '502636501812',
    projectId: 'costco-fe034',
    storageBucket: 'costco-fe034.firebasestorage.app',
  );
}
