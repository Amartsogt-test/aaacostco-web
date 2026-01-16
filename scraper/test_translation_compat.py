
import firebase_admin
from firebase_admin import credentials, firestore
from deep_translator import GoogleTranslator
import os

# 1. Test Translation
print("--- Testing Translation (deep-translator) ---")
try:
    # Use GoogleTranslator class
    translator = GoogleTranslator(source='auto', target='mn')
    result = translator.translate('Hello world')
    print(f"Translation result: {result}")
except Exception as e:
    print(f"Translation failed: {e}")

# 2. Test Firebase Init (Mock)
print("\n--- Testing Firebase Import ---")
try:
    print(f"Firebase Admin Version: {firebase_admin.__version__}")
    print("Firebase imports successful.")
except Exception as e:
    print(f"Firebase import failed: {e}")
