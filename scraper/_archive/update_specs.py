import firebase_admin
from firebase_admin import credentials, firestore
import os
import sys
import time

# Ensure scraper dir is in path
sys.path.append(os.path.join(os.getcwd(), 'scraper'))
from fast_scraper import init_firebase, get_costco_price_fast, update_firebase_product

def update_specs():
    print("--- 📝 MIGRATION: FIXING IMAGES & UPDATING SPECS ---")
    
    db = init_firebase()
    if not db:
        print("❌ Firebase init failed.")
        return

    # Get all documents from 'products' collection
    docs = db.collection('products').stream()
    
    count = 0
    updated_count = 0
    
    all_docs = list(docs)
    print(f"📂 Found {len(all_docs)} products in Firestore.")

    for doc in all_docs:
        count += 1
        code = doc.id
        data = doc.to_dict()
        name = data.get('name', 'N/A')
        
        print(f"\n[{count}/{len(all_docs)}] Processing {code} - {name}...")
        
        try:
            # Fetch fresh details including fixed HTML
            res = get_costco_price_fast(code)
            
            if not res or res[0] is None:
                print(f"   ⚠️ Failed to fetch details for {code}")
                continue
                
            krw_price, in_stock, product_url, product_name, product_image, discount_end_date, old_krw_price, product_name_en, product_details, specifications = res
            
            # Always update to ensure HTML is fixed
            update_firebase_product(
                db, 
                code, 
                krw_price, 
                in_stock, 
                product_url, 
                product_name, 
                product_image, 
                old_price=old_krw_price, 
                discount_end_date=discount_end_date,
                base_price=krw_price,
                base_old_price=old_krw_price,
                product_name_en=product_name_en,
                product_details=product_details,
                specifications=specifications
            )
            updated_count += 1
            print(f"   ✅ Updated.")

            time.sleep(0.5)

        except Exception as e:
            print(f"   ❌ Error updating {code}: {e}")

    print(f"\n🎉 Migration Complete. Updated {updated_count} products.")

if __name__ == "__main__":
    update_specs()
