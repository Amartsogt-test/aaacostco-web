
import json
import firebase_admin
from firebase_admin import credentials, firestore
import os
import sys

# Force UTF-8
sys.stdout.reconfigure(encoding='utf-8')

# Init Firebase
if not firebase_admin._apps:
    try:
        # Correct path as used in fast_scraper.py
        base_dir = os.path.dirname(os.path.abspath(__file__))
        cred_path = os.path.abspath(os.path.join(base_dir, '..', 'functions', 'service-account.json'))
            
        if not os.path.exists(cred_path):
            print(f"[ERR] File not found: {cred_path}")
            exit(1)
            
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
        print("[OK] Firebase initialized.")
    except Exception as e:
        print(f"[ERR] Firebase Init Failed: {e}")
        exit(1)

db = firestore.client()

CACHE_FILE = 'd:/Google Drive/aaacostco/public/products_cache.json'

def populate():
    try:
        with open(CACHE_FILE, 'r', encoding='utf-8') as f:
            products = json.load(f)
            
        print(f"Loaded {len(products)} source products.")
        
        target_count = 45
        generated = []
        
        count = 0
        while len(generated) < target_count:
            for p in products:
                if len(generated) >= target_count:
                    break
                
                # Create copy
                new_p = p.copy()
                if count > 0:
                    new_id = f"{p['id']}_{count}"
                    new_p['id'] = new_id
                    new_p['productId'] = new_id
                    new_p['name'] = f"{p['name']} (Copy {count})"
                
                generated.append(new_p)
            count += 1
            
        print(f"Generated {len(generated)} items. Uploading...")
        
        batch = db.batch()
        batch_count = 0
        
        for p in generated:
            doc_ref = db.collection('products').document(str(p['id']))
            # batch writes allowed up to 500
            batch.set(doc_ref, p, merge=True)
            batch_count += 1
            
            if batch_count >= 400:
                batch.commit()
                print(f"Committed batch of {batch_count}...")
                batch = db.batch()
                batch_count = 0
                
        if batch_count > 0:
            batch.commit()
            print(f"Committed final batch of {batch_count}.")
            
        print("[OK] Done populating DB.")
        
    except Exception as e:
        print(f"[ERR] Failed: {e}")

if __name__ == "__main__":
    populate()
