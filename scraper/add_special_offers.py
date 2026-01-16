import requests
import re
import pandas as pd
import os
import sys
import time
from fast_scraper import init_firebase, update_firebase_product, get_costco_price_fast, DB_FILE

# Costco API Search URL
SEARCH_API_URL = "https://www.costco.co.kr/rest/v2/korea/products/search"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

def find_special_offers(limit=5):
    print(f"Using extracted IDs from browser...")
    # IDs extracted by browser subagent from https://www.costco.co.kr/c/SpecialPriceOffers
    target_ids = ["511435", "511434", "1397553", "682469", "684390"]
    
    # Load existing DB
    if os.path.exists(DB_FILE):
        df = pd.read_excel(DB_FILE)
        existing_ids = df['CostcoCode'].astype(str).tolist()
    else:
        existing_ids = []
        df = pd.DataFrame(columns=["WooID", "CostcoCode", "Name"])

    found_products = []
    
    for code in target_ids:
        if str(code) in existing_ids:
            print(f"Product {code} already in DB. Skipping.")
            continue
            
        found_products.append({
            "code": code,
            "name": "Pending Fetch..." 
        })
        
    return found_products

def main():
    print("--- Starting Special Offers Scraper (Limit: 5) ---")
    
    new_products = find_special_offers(limit=5)
    
    if not new_products:
        print("No new products found in SpecialPriceOffers category.")
        return

    print(f"Found {len(new_products)} new products to add.")
    
    # Initialize DB and Firebase
    if os.path.exists(DB_FILE):
        df = pd.read_excel(DB_FILE)
    else:
        df = pd.DataFrame(columns=["WooID", "CostcoCode", "Name"])
    
    db = init_firebase()

    for p in new_products:
        code = p['code']
        print(f"\nProcessing {code} - {p['name']}...")
        
        # Fetch full details
        krw_price, in_stock, product_url, product_name, product_image, discount_end_date, old_krw_price, product_name_en, product_details, specifications = get_costco_price_fast(code)
        
        if not product_name:
            print(f"Failed to fetch details for {code}, skipping.")
            continue

        # Add to Excel
        new_row = {"WooID": 0, "CostcoCode": int(code), "Name": product_name}
        df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)
        
        # Sync to Firebase
        if db:
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
            time.sleep(1) # Polite delay
        
    df.to_excel(DB_FILE, index=False)
    print(f"\nSaved all valid products to {DB_FILE}")
    print("Done.")

if __name__ == "__main__":
    main()
