import requests
import re
import pandas as pd
import os
import sys
from fast_scraper import init_firebase, update_firebase_product, get_costco_price_fast, DB_FILE

# Costco Korea Special Offers Page
OFFERS_URL = "https://www.costco.co.kr/Offers/c/Cos_Offers"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

# Costco API Search URL
SEARCH_API_URL = "https://www.costco.co.kr/rest/v2/korea/products/search"

def find_new_discount_product():
    print(f"Fetching offers from API...")
def find_new_discount_product():
    print(f"Fetching products from API to find discounts...")
    try:
        # Search for all products (relevance)
        params = {
            "fields": "FULL",
            "query": ":relevance",
            "pageSize": 50,
            "currentPage": 0
        }
        
        r = requests.get(SEARCH_API_URL, headers=HEADERS, params=params, timeout=10)
        
        if r.status_code != 200:
            print(f"Failed to fetch API: {r.status_code}")
            return None

        data = r.json()
        products = data.get("products", [])
        print(f"Scanned {len(products)} products.")

        # Load existing DB
        if os.path.exists(DB_FILE):
            df = pd.read_excel(DB_FILE)
            existing_ids = df['CostcoCode'].astype(str).tolist()
        else:
            existing_ids = []
            df = pd.DataFrame(columns=["WooID", "CostcoCode", "Name"])

        max_pages = 5
        found_code = None

        # Strategy 1: Search specific Offer category
        print("Strategy 1: Searching category:Cos_Offers...")
        params["query"] = ":relevance:category:Cos_Offers"
        r = requests.get(SEARCH_API_URL, headers=HEADERS, params=params, timeout=10)
        if r.status_code == 200:
            data = r.json()
            products = data.get("products", [])
            for p in products:
                code = p.get("code")
                if code and str(code) not in existing_ids:
                    print(f"Found discounted product in Offer category: {code}")
                    return code

        # Strategy 2: Broad search + Filter for potentialPromotions
        print("Strategy 2: Scanning all products for discounts...")
        params["query"] = ":relevance"
        
        for page in range(max_pages):
            print(f"Scanning page {page}...")
            params["currentPage"] = page
            try:
                r = requests.get(SEARCH_API_URL, headers=HEADERS, params=params, timeout=10)
                if r.status_code != 200: continue
                data = r.json()
                products = data.get("products", [])
                if not products: break

                for p in products:
                     code = p.get("code")
                     if not code or str(code) in existing_ids: continue
                     
                     is_discounted = False
                     if p.get("potentialPromotions"): is_discounted = True
                     if p.get("price", {}).get("wasPrice"): is_discounted = True
                     
                     if is_discounted:
                         print(f"Found discounted product via scan: {code}")
                         return code
            except: continue

        # Strategy 3: Fallback - Pick ANY new product
        print("Strategy 3: Fallback - Picking ANY new product...")
        params["currentPage"] = 0
        r = requests.get(SEARCH_API_URL, headers=HEADERS, params=params, timeout=10)
        if r.status_code == 200:
            data = r.json()
            products = data.get("products", [])
            for p in products:
                code = p.get("code")
                if code and str(code) not in existing_ids:
                     print(f"Fallback: Selected normal product: {code}")
                     return code

        return None

        # Load existing DB
        if os.path.exists(DB_FILE):
            df = pd.read_excel(DB_FILE)
            existing_ids = df['CostcoCode'].astype(str).tolist()
        else:
            existing_ids = []
            df = pd.DataFrame(columns=["WooID", "CostcoCode", "Name"])

        # Find a new ID
        new_id = None
        for pid in unique_ids:
            if pid not in existing_ids:
                new_id = pid
                break
        
        if not new_id:
            print("No NEW products found on Offers page (all already in DB).")
            # Optional: Pick one anyway if we want just *any* discounted product, but the user asked to "add 1 product".
            # If all are added, maybe we should pick one that isn't focused?
            # For now return None.
            return None

        print(f"Selected New Product ID: {new_id}")
        return new_id

    except Exception as e:
        print(f"Error searching for products: {e}")
        return None

def main():
    print("--- Starting Single Product Add Tool ---")
    
    product_code = find_new_discount_product()
    
    if not product_code:
        print("Could not find a new product to add.")
        return

    # Fetch details to get the Name for the DB
    print(f"Fetching details for {product_code}...")
    krw_price, in_stock, product_url, product_name, product_image, discount_end_date, old_krw_price, product_name_en, product_details, specifications = get_costco_price_fast(product_code)

    if not product_name:
        print("Failed to get product details from API.")
        return

    print(f"Found: {product_name}")
    print(f"Price: {krw_price}, Old: {old_krw_price}, EndDate: {discount_end_date}")

    # Add to Excel DB
    new_row = {"WooID": 0, "CostcoCode": int(product_code), "Name": product_name}
    
    if os.path.exists(DB_FILE):
        df = pd.read_excel(DB_FILE)
    else:
        df = pd.DataFrame(columns=["WooID", "CostcoCode", "Name"])
        
    df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)
    df.to_excel(DB_FILE, index=False)
    print(f"Added {product_code} to {DB_FILE}")

    # Sync to Firebase
    db = init_firebase()
    if db:
        update_firebase_product(
            db, 
            product_code, 
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
        print("Sync to Firebase completed.")
    else:
        print("Firebase init failed, could not sync.")

if __name__ == "__main__":
    main()
