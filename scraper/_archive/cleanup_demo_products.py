import firebase_admin
from firebase_admin import credentials, firestore
import os

# Initialize Firebase
if not firebase_admin._apps:
    try:
        cred_path = r"c:\Users\Batbileg\_Costco\functions\service-account.json"
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
        print("✅ Firebase Admin Initialized")
    except Exception as e:
        print(f"❌ Failed to initialize Firebase: {e}")
        exit(1)

db = firestore.client()

def cleanup_demo_products():
    # Names of products seen in the screenshot
    demo_product_names = [
        "Kirkland Signature Цэвэр Ус, 500мл х 40ш",
        "Tide Угаалгын Нунтаг, 5кг",
        "Dyson V15 Detect Tooc Сорогч",
        "Kirkland Signature Холимог Самар, 1.13кг",
        "Samsung 65\" QLED 4K зурагт",
        "Huggies Хүүхдийн Живх, Size 4, 180ш",
        "Apple MacBook Air 13\" M2 Chip",
        "Kirkland Signature Олив Тос, 2л"
    ]

    print("🔍 Searching for demo products to delete...")
    products_ref = db.collection('products')
    
    # We'll scan all products since we don't know their IDs
    # For a real production app with many items, this scan would be slow, 
    # but for this cleanup it's fine.
    docs = products_ref.stream()
    
    deleted_count = 0
    
    for doc in docs:
        data = doc.to_dict()
        name = data.get('name', '')
        
        # Check if this product's name starts with any of our demo names
        # (Using startswith or in to be safe against minor variations)
        is_demo = any(demo_name in name for demo_name in demo_product_names)
        
        if is_demo:
            print(f"🗑️ Deleting: {doc.id} - {name}")
            try:
                db.collection('products').document(doc.id).delete()
                deleted_count += 1
            except Exception as e:
                print(f"   ⚠️ Error deleting {doc.id}: {e}")

    print(f"\n✅ Cleanup complete. Deleted {deleted_count} demo products.")

if __name__ == "__main__":
    cleanup_demo_products()
