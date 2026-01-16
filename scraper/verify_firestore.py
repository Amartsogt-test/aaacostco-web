import firebase_admin
from firebase_admin import credentials, firestore
import os

# Initialize Firebase (reuse same check as scraper)
if not firebase_admin._apps:
    cred_path = r"c:\Users\Batbileg\_Costco\functions\service-account.json"
    cred = credentials.Certificate(cred_path)
    firebase_admin.initialize_app(cred)

db = firestore.client()

def verify_product(product_code):
    doc_ref = db.collection('products').document(str(product_code))
    doc = doc_ref.get()
    
    if doc.exists:
        data = doc.to_dict()
        print(f"✅ Document found: {product_code}")
        print(f"   - Name: {data.get('name')}")
        print(f"   - Price (Current/Stored): {data.get('price')}")
        print(f"   - Base Price (KRW): {data.get('basePrice')}")
        print(f"   - Old Price (Stored): {data.get('oldPrice')}")
        print(f"   - Base Old Price (KRW): {data.get('baseOldPrice')}")
        print(f"   - Discount End: {data.get('discountEndDate')}")
        print(f"   - Image: {data.get('image')}")
    else:
        print(f"❌ Document {product_code} does not exist!")

if __name__ == "__main__":
    verify_product(1785779)
