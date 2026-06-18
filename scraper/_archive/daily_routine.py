import logging
import time
import json
import os
import sys


# Import Playwright
from playwright.sync_api import sync_playwright

# Import Firebase & Config
import firebase_admin
from firebase_admin import credentials, firestore
from config import FIREBASE_CREDENTIALS, HEADLESS, SLOW_MO, EXCHANGE_RATE, MARGIN_MULTIPLIER, SHIPPING_PER_KG, DEFAULT_WEIGHT_ESTIMATE

# Setup Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("DailyRoutine")

# --- 1. SETUP FIREBASE ---
def init_db():
    try:
        if not firebase_admin._apps:
            cred = credentials.Certificate(FIREBASE_CREDENTIALS)
            firebase_admin.initialize_app(cred)
        return firestore.client()
    except Exception as e:
        logger.error(f"Firebase Init Error: {e}")
        return None

db = init_db()

# --- 2. CONFIG: TARGET URLS ---
TARGETS = [
    {"name": "SpecialPriceOffers", "url": "https://www.costco.co.kr/Special-Price-Offers/c/SpecialPriceOffers", "tag": "Sale"},
    {"name": "BuyersPick", "url": "https://www.costco.co.kr/Buyers-Pick/c/BuyersPick", "tag": "Featured"},
    {"name": "NewArrivals", "url": "https://www.costco.co.kr/c/whatsnew", "tag": "New"},
    {"name": "Kirkland", "url": "https://www.costco.co.kr/Kirkland-Signature/c/ks_all", "tag": "Kirkland Signature"},
]

# --- 3. HELPER: PRICE CALCULATION ---
def calculate_local_price(krw_price):
    if not krw_price or krw_price <= 0:
        return 0
    
    # Formula: (KRW * Rate) + (Shipping * Weight)
    cost_mnt = (krw_price * EXCHANGE_RATE) + (SHIPPING_PER_KG * DEFAULT_WEIGHT_ESTIMATE)
    final_price = cost_mnt * MARGIN_MULTIPLIER
    return int(final_price) # Round to integer




# --- 5. STEP 1: HEADLESS SCRAPE & SYNC ---
def scrape_and_sync_all(context):
    if not db: return

    all_active_codes = set()
    
    for target in TARGETS:
        logger.info(f"🚀 [STEP 1] Scraping {target['name']}...")
        page = context.new_page()
        
        # Keep track of codes found in THIS category to handle tag cleanup
        category_codes = set()
        
        try:
            page.goto(target['url'])
            time.sleep(3)
            
            # Simple pagination loop (limit 5 pages for daily check robustness)
            for p_idx in range(5):
                logger.info(f"   > Page {p_idx}...")
                
                # Check for products
                products = page.query_selector_all("sip-product-list-item") or page.query_selector_all(".product-item")
                if not products:
                    logger.info("   > No more products.")
                    break
                
                # Extract Data
                batch = db.batch()
                batch_count = 0
                
                for p in products:
                    try:
                        # Extract Code
                        # Input hidden name="productCodePost" value="635295"
                        code_input = p.query_selector("input[name='productCodePost']")
                        code = code_input.get_attribute("value") if code_input else None
                        
                        # Extract Name & Price
                        name_el = p.query_selector(".lister-name") or p.query_selector(".product-name-container a")
                        price_el = p.query_selector(".product-price-amount") or p.query_selector(".price-value")
                        
                        if code and name_el:
                            name = name_el.inner_text().strip()
                            price_text = price_el.inner_text().strip() if price_el else "0"
                            
                            # Clean Price
                            clean_price = price_text.replace('₩', '').replace('원', '').replace(',', '').strip()
                            try:
                                krw_price = float(clean_price)
                            except:
                                krw_price = 0
                                
                            category_codes.add(code)
                            all_active_codes.add(code)
                            
                            # Prepare Update
                            doc_ref = db.collection('products').document(code)
                            
                            # Calculate Local Price
                            local_price = calculate_local_price(krw_price)
                            
                            updates = {
                                "id": code,
                                "name": name,
                                "priceKRW": krw_price, # Store source price
                                "updatedAt": firestore.SERVER_TIMESTAMP,
                                "lastScraped": firestore.SERVER_TIMESTAMP,
                                "source": "daily_routine"
                            }
                            
                            # Only update visible price if > 0 (Never set to 0 from headless if it fails)
                            if local_price > 0:
                                updates["price"] = local_price
                            
                            # Add Tag using arrayUnion
                            updates["additionalCategories"] = firestore.ArrayUnion([target['tag']])
                            
                            batch.set(doc_ref, updates, merge=True)
                            batch_count += 1
                            
                    except Exception as e:
                        print(f"Error parsing item: {e}")

                if batch_count > 0:
                    batch.commit()
                    logger.info(f"   > Synced {batch_count} items.")
                
                if len(products) < 10:
                    break
                    
                next_url = f"{target['url']}?page={p_idx + 1}"
                page.goto(next_url)
                time.sleep(2)
                
        except Exception as e:
            logger.error(f"Failed category {target['name']}: {e}")
        finally:
            page.close()
            
        # --- CLEANUP TAGS ---
        logger.info(f"🧹 [STEP 2] Cleaning up tags for {target['name']}...")
        cleanup_tags(target['tag'], category_codes)

def cleanup_tags(tag, active_codes):
    if not db: return
    # Query all products with this tag
    docs = db.collection('products').where('additionalCategories', 'array_contains', tag).stream()
    
    batch = db.batch()
    count = 0
    removed = 0
    
    for doc in docs:
        if doc.id not in active_codes:
            # Remove tag
            batch.update(doc.reference, {
                "additionalCategories": firestore.ArrayRemove([tag])
            })
            removed += 1
            count += 1
            
        if count >= 400:
            batch.commit()
            batch = db.batch()
            count = 0
            
    if count > 0:
        batch.commit()
    
    logger.info(f"   > Removed '{tag}' tag from {removed} expired items.")


# --- 6. STEP 3: SYNC COOKIES TO CLOUD ---
def sync_cookies_to_firestore():
    """Syncs state.json to Firestore for Cloud Functions"""
    if not db: return
    try:
        logger.info("☁️  Syncing credentials to Firestore (for Cloud Functions)...")
        if not os.path.exists("state.json"): return
        
        with open("state.json", 'r') as f:
            data = json.load(f)
            
        cookies = data.get('cookies', [])
        if not cookies: return
        
        # Format for header
        cookie_string = "; ".join([f"{c['name']}={c['value']}" for c in cookies])
        
        db.collection('settings').document('scraper').set({
            'cookie': cookie_string,
            'userAgent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'updatedAt': firestore.SERVER_TIMESTAMP
        }, merge=True)
        
        logger.info("✅ Cloud Scraper Credentials updated successfully!")
    except Exception as e:
        logger.error(f"❌ Failed to sync to cloud: {e}")


# --- 7. STEP 4 & 5: CHECK ZERO PRICES & FIX ---
def check_and_fix_zero_prices(playwright):
    logger.info("🔍 [STEP 3] Checking for Zero Price Products...")
    
    if not db: return
    zero_docs = db.collection('products').where('price', '==', 0).stream()
    zero_products = [d for d in zero_docs]
    
    if not zero_products:
        logger.info("✅ No zero-price products found. Daily routine complete.")
        return
        
    logger.info(f"⚠️ Found {len(zero_products)} products with 0 price.")
    
    # --- INTERACTIVE LOGIN (STEP 4) ---
    logger.info("🔐 [STEP 4] Launching Headed Browser for Manual Fix...")
    browser = playwright.chromium.launch(headless=False)
    context = browser.new_context(
        viewport={'width': 1280, 'height': 800},
        user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    )
    
    # Load cookies if exist
    if os.path.exists("state.json"):
        try:
           with open("state.json", 'r') as f:
               context.add_cookies(json.load(f)['cookies'])
        except: pass
        
    page = context.new_page()
    
    # Check Login
    page.goto("https://www.costco.co.kr/my-account")
    time.sleep(2)
    
    if "login" in page.url:
        print("\n" + "!"*60)
        print(" USER INTERACTION REQUIRED: Please Log In!")
        print(" 1. Browser is open.")
        print(" 2. Log in to Costco.")
        print(" 3. Come back here and PRESS ENTER.")
        print("!"*60 + "\n")
        input(">> Press Enter when logged in... <<")
        
        context.storage_state(path="state.json")
        logger.info("✅ Cookies saved locally to state.json")
        
        # SYNC TO CLOUD
        sync_cookies_to_firestore()
    else:
        logger.info("✅ Already logged in (Cookies Valid).")
        # Try syncing anyway to be fresh
        # context.storage_state(path="state.json")
        # sync_cookies_to_firestore()
        
    # --- FIX LOOP (STEP 5) ---
    logger.info("🛠️ [STEP 5] Fixing Prices...")
    
    count_fixed = 0
    
    for doc in zero_products:
        data = doc.to_dict()
        pid = doc.id
        pname = data.get('name', 'Unknown')
        
        if data.get('isManualPrice') is True:
            logger.info(f"   ⏭️ Skipping {pname} (Admin Locked)")
            continue
            
        logger.info(f"   > Fixing: {pid} - {pname}")
        
        try:
            product_url = f"https://www.costco.co.kr/p/{pid}"
            page.goto(product_url)
            page.wait_for_load_state("domcontentloaded")
            time.sleep(5) # Wait 5 seconds for dynamic price to load

            
            price_el = page.query_selector(".product-price-amount") or page.query_selector(".price-value")
            
            if price_el:
                price_text = price_el.inner_text().strip()
                clean_price = price_text.replace('₩', '').replace('원', '').replace(',', '').strip()
                
                if clean_price and clean_price.replace('.', '').isdigit():
                    krw_price = float(clean_price)
                    
                    if krw_price > 0:
                        final_price = calculate_local_price(krw_price)
                        
                        db.collection('products').document(pid).update({
                            "price": final_price,
                            "priceKRW": krw_price,
                            "lastFixed": firestore.SERVER_TIMESTAMP,
                            "status": "active"
                        })
                        logger.info(f"     ✅ Fixed! {final_price} MNT (from {krw_price} KRW)")
                        count_fixed += 1
                        time.sleep(1) 
                    else:
                        logger.warning(f"     ⚠️ Still 0 KRW. Out of stock?")
                else:
                    logger.warning(f"     ⚠️ Price text invalid: {price_text}")
            else:
                logger.warning("     ⚠️ Price element not found.")
                
        except Exception as e:
            logger.error(f"     ❌ Error on {pid}: {e}")
            
    logger.info(f"🎉 Done! Fixed {count_fixed} products.")
    print("\n" + "="*30)
    print(" BROWSER STAYING OPEN INDEFINITELY.")
    print(" Use Ctrl+C in terminal to stop.")
    print("="*30 + "\n")
    
    try:
        while True:
            time.sleep(10)
    except KeyboardInterrupt:
        print("Stopping...")
        browser.close()


# --- MAIN EXECUTION ---
def run_daily_routine():
    print("""
    ==============================
       COSTCO DAILY ROUTINE
    ==============================
    1. Scrape Categories (Headless)
    2. Sync & Cleanup Tags
    3. Check Zero Prices
    4. Fix Zero Prices (Interactive)
    """)
    
    input("Press Enter to Start Processing...")
    
    with sync_playwright() as p:
        # 1. Headless Phase
        logger.info("--- PHASE 1: CATEGORY SYNC (HEADLESS) ---")
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(user_agent="Mozilla/5.0 ...")
        scrape_and_sync_all(context)
        browser.close()
        
        # 2. Fix Phase
        logger.info("--- PHASE 2: ZERO PRICE FIX (HEADED) ---")
        check_and_fix_zero_prices(p)

if __name__ == "__main__":
    run_daily_routine()
