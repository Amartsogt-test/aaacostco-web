
import requests
import time
import os
import sys
# Force UTF-8 encoding for Windows console
sys.stdout.reconfigure(encoding='utf-8')

import pandas as pd
from fast_scraper import init_firebase, update_firebase_product, get_costco_price_fast, set_product_inactive

# Config
SEARCH_API_URL = "https://www.costco.co.kr/rest/v2/korea/products/search"
HEADERS = {
    "User-Agent": "Mozilla/5.0"
}
EXISTING_CACHE_FILE = r'd:/Google Drive/aaacostco/public/products_cache.json'

def resume_fetch(limit=50):
    db = init_firebase()
    if not db:
        print("[ERR] Could not init Firebase")
        return

    # 1. Get existing product IDs from Cloud Firestore (or local cache) to avoid re-scraping
    print("[INFO] Checking existing products in DB...")
    coll_ref = db.collection('products')
    docs = coll_ref.stream()
    existing_ids = set()
    for d in docs:
        existing_ids.add(d.id)
    
    print(f"[INFO] Found {len(existing_ids)} existing products in DB.")

    if len(existing_ids) >= limit:
        print(f"[OK] Already have {len(existing_ids)} products (Limit: {limit}). No need to scrape more.")
        return

    needed = limit - len(existing_ids)
    print(f"[INFO] Need {needed} more products.")

    # 2. Get Product IDs from Costco Search until we have enough NEW ones
    print(f"[INFO] Searching for new products...")
    
    new_product_codes = []
    page = 0
    
    while len(new_product_codes) < needed:
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
                print("No more products found from API.")
                break
                
            for p in products:
                code = p.get("code")
                # Add if not in DB and not already in our new list
                if code and code not in existing_ids and code not in new_product_codes:
                    new_product_codes.append(code)
                    if len(new_product_codes) >= needed:
                        break
            
            page += 1
            print(f"   Collected {len(new_product_codes)} NEW IDs so far...")
            # Safety break for pages
            if page > 10: 
                print("   [WARN] Scanned too many pages.")
                break
            
        except Exception as e:
            print(f"Error searching: {e}")
            break

    print(f"[OK] Selected {len(new_product_codes)} new products to scrape.")

    # 3. Scrape and Save (Append Mode)
    success_count = 0
    
    # Load existing cache to preserve it
    import json
    all_products_data = []
    if os.path.exists(EXISTING_CACHE_FILE):
        try:
            with open(EXISTING_CACHE_FILE, 'r', encoding='utf-8') as f:
                all_products_data = json.load(f)
        except:
            all_products_data = []
    
    # We might have stale data in cache vs DB, but for now we append new ones.
    # Ideally we rebuild the cache from DB at the end.
    
    for i, code in enumerate(new_product_codes):
        print(f"[{i+1}/{len(new_product_codes)}] Scraping {code}...")
        
        try:
            # Re-use logic from fast_scraper
            res = get_costco_price_fast(code)
            
            # Unpack
            (krw_price, in_stock, product_url, product_name, product_image, 
             discount_end_date, old_krw_price, product_name_en, product_details, 
             specifications, category, sub_category, productId, unitPrice) = res
             
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
                    unitPrice=unitPrice
                )
                
                # Append to list for JSON cache
                new_item = {
                    "id": str(code),
                    "productId": productId,
                    "name": product_name,
                    "name_en": product_name_en,
                    "price": krw_price, 
                    "oldPrice": old_krw_price,
                    "image": product_image,
                    "category": category,
                    "subCategory": sub_category,
                    "stock": "inStock" if in_stock else "outOfStock",
                    "specifications": specifications,
                    "updatedAt": pd.Timestamp.now().isoformat()
                }
                
                # Update cache list (remove if exists, then add)
                all_products_data = [x for x in all_products_data if x['id'] != str(code)]
                all_products_data.append(new_item)
                
                print("   [WAIT] Sleeping 2s...")
                time.sleep(2)

                success_count += 1
            else:
                # Бараа олдоогүй тул inactive болгоно
                print(f"   Costco API-д олдохгүй, INACTIVE болгож байна...")
                set_product_inactive(db, code, reason="not_found_on_costco")
                
        except Exception as e:
            print(f"   Error processing {code}: {e}")
            
    print(f"[OK] Finished! Uploaded {success_count} new products.")
    
    # Save to JSON
    try:
        with open(EXISTING_CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(all_products_data, f, ensure_ascii=False, indent=2)
        print(f"[OK] Updated products cache at {EXISTING_CACHE_FILE}")
    except Exception as e:
        print(f"[ERR] Failed to save cache: {e}")

if __name__ == "__main__":
    resume_fetch(50)
