
import firebase_admin
from firebase_admin import credentials, firestore
import os

# Firebase Credentials Path
FIREBASE_CRED_PATH = 'd:/Google Drive/aaacostco/functions/service-account.json'

if not firebase_admin._apps:
    cred = credentials.Certificate(FIREBASE_CRED_PATH)
    firebase_admin.initialize_app(cred)

db = firestore.client()

def clear_copies():
    print("Fetching products...")
    docs = db.collection('products').stream()
    
    batch = db.batch()
    delete_count = 0
    
    for doc in docs:
        doc_id = doc.id
        if "_" in doc_id or "(Copy" in doc.to_dict().get('name', ''):
            print(f"Deleting duplicate: {doc_id}")
            batch.delete(doc.reference)
            delete_count += 1
            if delete_count >= 400:
                batch.commit()
                batch = db.batch()
                
    if delete_count > 0:
        batch.commit()
        print(f"Deleted {delete_count} copies.")
    else:
        print("No copies found.")

if __name__ == "__main__":
    clear_copies()
