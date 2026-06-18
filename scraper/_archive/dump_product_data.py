
import firebase_admin
from firebase_admin import credentials, firestore
from config import FIREBASE_CREDENTIALS
import json

if not firebase_admin._apps:
    cred = credentials.Certificate(FIREBASE_CREDENTIALS)
    firebase_admin.initialize_app(cred)

db = firestore.client()

# 1. Fetch doc with ID 1397553
doc_ref = db.collection(u'products').document(u'1397553')
doc = doc_ref.get()
if doc.exists:
    print("--- Doc 1397553 ---")
    print(json.dumps(doc.to_dict(), indent=2, default=str))
else:
    print("--- Doc 1397553 NOT FOUND ---")

# 2. Fetch a doc with hash-like ID (longer than 10 chars)
products_ref = db.collection(u'products').limit(20)
docs = products_ref.stream()
print("\n--- Scanning for Hash ID docs ---")
for d in docs:
    if len(d.id) > 10:
        print(f"Found Hash ID: {d.id}")
        print(json.dumps(d.to_dict(), indent=2, default=str))
        break
