
import logging
import time
import json
import os
import sys
from playwright.sync_api import sync_playwright
import firebase_admin
from firebase_admin import credentials, firestore
from config import FIREBASE_CREDENTIALS, EXCHANGE_RATE, MARGIN_MULTIPLIER, SHIPPING_PER_KG, DEFAULT_WEIGHT_ESTIMATE

# Setup Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("ZeroPriceFixer")

# --- DATABASE SETUP ---
def init_db():
    if not firebase_admin._apps:
        cred = credentials.Certificate(FIREBASE_CREDENTIALS)
        firebase_admin.initialize_app(cred)
    return firestore.client()

db = init_db()

# --- HELPER: PRICE CALCULATION ---
def calculate_local_price(krw_price):
    if not krw_price or krw_price <= 0:
        return 0
    # Formula: (KRW * Rate) + (Shipping * Weight)
    cost_mnt = (krw_price * EXCHANGE_RATE) + (SHIPPING_PER_KG * DEFAULT_WEIGHT_ESTIMATE)
    final_price = cost_mnt * MARGIN_MULTIPLIER
    return int(final_price) # Round to integer

# --- MAIN LOGIC ---
def fix_prices():
    print("""
    ==============================
       ZERO PRICE FIXER
    ==============================
    This script will:
    1. Find ALL products in Firebase with price == 0 or priceKRW == 0
    2. Open a HEADED browser
    3. Wait for you to confirm you are logged in
    4. Go to each product and update the price
    """)
    
    input("Press Enter to find products...")
    
    # 1. FIND PRODUCTS (Robust Logic)
    logger.info("🔍 Scanning ALL products for zero prices...")
    all_docs = db.collection('products').stream()
    
    targets = []
    for doc in all_docs:
        data = doc.to_dict()
        pid = doc.id
        price = data.get('price', 0)
        price_krw = data.get('priceKRW', 0)
        
        # Robust Zero Check
        is_zero = False
        try:
             p_val = float(str(price).replace(',', '')) if price else 0
             p_krw_val = float(str(price_krw).replace(',', '')) if price_krw else 0
             
             if p_val == 0 or p_krw_val == 0:
                 is_zero = True
        except:
            is_zero = True
            
        if is_zero:
            targets.append(doc)
            
    logger.info(f"🚨 Found {len(targets)} zero-price products to fix.")
    
    if len(targets) == 0:
        return

    # 2. BROWSER SETUP
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False) # HEADED MODE
        context = browser.new_context(
            viewport={'width': 1280, 'height': 800},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )
        
        # Load cookies if exist
        if os.path.exists("state.json"):
            try:
                with open("state.json", 'r') as f:
                    context.add_cookies(json.load(f)['cookies'])
                logger.info("🍪 Cookies loaded.")
            except: pass
            
        page = context.new_page()
        
        # 3. LOGIN INTERACTION
        page.goto("https://www.costco.co.kr/my-account")
        
        print("\n" + "!"*60)
        print(" ACTION REQUIRED:")
        print(" 1. Please ensure you are LOGGED IN as Admin in the opened browser.")
        print(" 2. If 'Access Denied' appears, solve the captcha or login.")
        print(" 3. PRESS ENTER HERE WHEN READY TO START FIXING.")
        print("!"*60 + "\n")
        input(">> Press Enter to Start Fixing... <<")
        
        # Save cookies for future
        context.storage_state(path="state.json")
        
        # 4. ITERATE AND FIX
        count_fixed = 0
        count_skipped = 0
        
        for i, doc in enumerate(targets):
            pid = doc.id
            data = doc.to_dict()
            name = data.get('name', 'N/A')
            
            logger.info(f"[{i+1}/{len(targets)}] Checking {pid}...")
            
            try:
                url = f"https://www.costco.co.kr/p/{pid}"
                page.goto(url)
                
                # Wait for price element
                try:
                    page.wait_for_selector(".product-price-amount, .price-value", timeout=5000)
                except:
                    logger.warning(f"   ⚠️ Price element not found (Out of Stock or Deleted?). Skipping.")
                    count_skipped += 1
                    continue
                
                # Extract Price
                price_el = page.query_selector(".product-price-amount") or page.query_selector(".price-value")
                if not price_el:
                     logger.warning(f"   ⚠️ No price element. Skipping.")
                     continue
                     
                price_text = price_el.inner_text().strip()
                clean_price = price_text.replace('₩', '').replace('원', '').replace(',', '').strip()
                
                if not clean_price or not clean_price.replace('.','').isdigit():
                    logger.warning(f"   ⚠️ Invalid price text: '{price_text}'")
                    continue
                    
                krw_price = float(clean_price)
                
                if krw_price > 0:
                    local_price = calculate_local_price(krw_price)
                    
                    db.collection('products').document(pid).update({
                        "price": local_price,
                        "priceKRW": krw_price,
                        "lastFixed": firestore.SERVER_TIMESTAMP,
                        "status": "active" # Reactivate if it was inactive
                    })
                    logger.info(f"   ✅ Fixed: {local_price} MNT ({krw_price} KRW)")
                    count_fixed += 1
                else:
                    logger.info(f"   ⚠️ Price is still 0 (placeholder?). Skipping.")
                
                # Small sleep to be polite
                time.sleep(1)
                
            except Exception as e:
                logger.error(f"   ❌ Error processing {pid}: {e}")
                
        print("\n" + "="*30)
        print(f" COMPLETED. Fixed: {count_fixed}, Skipped: {count_skipped}")
        print("="*30 + "\n")
        
        # Keep browser open if needed
        input("Press Enter to close browser...")

if __name__ == "__main__":
    fix_prices()
