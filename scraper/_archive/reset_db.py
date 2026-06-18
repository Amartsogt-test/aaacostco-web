import firebase_admin
from firebase_admin import credentials, firestore
import os

cred_path = r"c:\Users\Batbileg\_Costco\functions\service-account.json"

def reset_database():
    print("🗑️ Resetting Database (Removing all products)...")
    if not os.path.exists(cred_path):
        print(f"❌ Credential file missing: {cred_path}")
        return

    try:
        if not firebase_admin._apps:
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
        
        db = firestore.client()
        coll_ref = db.collection('products')
        
        # Batch delete
        # Note: list_documents yields all documents in the collection
        docs = list(coll_ref.list_documents())
        print(f"Found {len(docs)} documents to delete.")
        
        if not docs:
            print("✅ Database is already empty.")
            return

        batch = db.batch()
        count = 0
        total_deleted = 0
        
        for doc in docs:
            batch.delete(doc)
            count += 1
            total_deleted += 1
            
            if count >= 400:
                batch.commit()
                print(f"   Deleted {total_deleted} docs...", end='\r')
                batch = db.batch()
                count = 0
        
        if count > 0:
            batch.commit()
            
        print(f"\n✅ Successfully deleted {total_deleted} documents.")
        
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    reset_database()
