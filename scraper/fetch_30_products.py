
import requests
import time
import os
import sys
# Force UTF-8 encoding for Windows console
sys.stdout.reconfigure(encoding='utf-8')

import pandas as pd
from fast_scraper import init_firebase, update_firebase_product, get_costco_price_fast

# Config
SEARCH_API_URL = "https://www.costco.co.kr/rest/v2/korea/products/search"
HEADERS = {
    "User-Agent": "Mozilla/5.0"
}

def reset_database(db):
    print("[INFO] Resetting Database (Removing all products)...")
    coll_ref = db.collection('products')
    docs = list(coll_ref.list_documents())
    
    if not docs:
        print("[OK] Database is already empty.")
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
            batch = db.batch()
            count = 0
            
    if count > 0:
        batch.commit()
        
    print(f"[OK] Successfully deleted {total_deleted} documents.")

def fetch_and_populate(limit=30):
    db = init_firebase()
    if not db:
        return

    # 1. Reset DB
    reset_database(db)

    # 2. Get 30 Product IDs from Costco Search
    print(f"[INFO] Creating list of {limit} products...")
    product_codes = []
    
    page = 0
    while len(product_codes) < limit:
        params = {
            "fields": "FULL",
            "query": ":relevance", # Default sort
            "pageSize": 20,
            "currentPage": page
        }
        
        try:
            r = requests.get(SEARCH_API_URL, headers=HEADERS, params=params, timeout=10)
            data = r.json()
            products = data.get("products", [])
            
            if not products:
                print("No more products found.")
                break
                
            for p in products:
                code = p.get("code")
                if code and code not in product_codes:
                    product_codes.append(code)
                    if len(product_codes) >= limit:
                        break
            
            page += 1
            print(f"   Collected {len(product_codes)} IDs so far...")
            
        except Exception as e:
            print(f"Error searching: {e}")
            break

    print(f"[OK] Selected {len(product_codes)} products. Starting scrape...")

    # 3. Scrape and Save
    success_count = 0
    all_products_data = []
    
    for i, code in enumerate(product_codes):
        print(f"[{i+1}/{len(product_codes)}] Scraping {code}...")
        
        try:
            # Re-use logic from fast_scraper
            res = get_costco_price_fast(code)
            
            # Unpack (Updated to 20 values)
            (krw_price, in_stock, product_url, product_name, product_image, 
             discount_end_date, old_krw_price, product_name_en, product_details, 
             specifications, category, sub_category, productId, unitPrice,
             averageRating, numberOfReviews, minOrderQuantity, maxOrderQuantity, all_images, breadcrumbs) = res
             
            if product_name:
                update_firebase_product(
                    db, code, krw_price, in_stock, product_url, product_name, product_image,
                    old_price=old_krw_price,
                    discount_end_date=discount_end_date,
                    base_price=krw_price,
                    base_old_price=old_krw_price,
                    product_name_en=product_name_en,
                    product_details=product_details,
                    specifications=specifications,
                    category=category,
                    sub_category=sub_category,
                    productId=productId,
                    unitPrice=unitPrice,
                    averageRating=averageRating,
                    reviewCount=numberOfReviews,
                    minOrderQty=minOrderQuantity,
                    maxOrderQty=maxOrderQuantity,
                    images=all_images,
                    breadcrumbs=breadcrumbs
                )
                
                # Append to list for JSON cache
                all_products_data.append({
                    "id": str(code),
                    "productId": productId,
                    "name": product_name,
                    "name_en": product_name_en,
                    "price": krw_price, 
                    "oldPrice": old_krw_price,
                    "image": product_image,
                    "images": all_images,
                    "category": category,
                    "subCategory": sub_category,
                    "breadcrumbs": breadcrumbs,
                    "stock": "inStock" if in_stock else "outOfStock",
                    "specifications": specifications,
                    "rating": float(averageRating) if averageRating else 0,
                    "reviewCount": int(numberOfReviews) if numberOfReviews else 0,
                    "minOrderQty": int(minOrderQuantity) if minOrderQuantity else None,
                    "maxOrderQty": int(maxOrderQuantity) if maxOrderQuantity else None,
                    "unitPrice": unitPrice,
                    "updatedAt": pd.Timestamp.now().isoformat()
                })
                
                print("   [WAIT] Sleeping 2s...")
                time.sleep(2)

                success_count += 1
            else:
                print("   Skipping (No Data)")
                
        except Exception as e:
            print(f"   Error processing {code}: {e}")
            
    print(f"[OK] Finished! Uploaded {success_count} products.")
    
    # Save to JSON for fallback
    try:
        import json
        cache_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'public', 'products_cache.json'))
        with open(cache_path, 'w', encoding='utf-8') as f:
            json.dump(all_products_data, f, ensure_ascii=False, indent=2)
        print(f"[OK] Saved products cache to {cache_path}")
    except Exception as e:
        print(f"[ERR] Failed to save cache: {e}")

if __name__ == "__main__":
    fetch_and_populate(50)
