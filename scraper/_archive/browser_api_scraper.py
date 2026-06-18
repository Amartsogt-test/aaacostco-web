import time
import json
import logging
import hashlib
from playwright.sync_api import sync_playwright
from config import FIREBASE_CREDENTIALS

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- CONFIGURATION ---
CATEGORIES = [
    {"name": "Electronics", "base_url": "https://www.costco.co.kr/Electronics/c/cos_1/results"},
]

def init_firestore():
    import firebase_admin
    from firebase_admin import credentials, firestore

    if not firebase_admin._apps:
        cred = credentials.Certificate(FIREBASE_CREDENTIALS)
        firebase_admin.initialize_app(cred)
    return firestore.client()

def calculate_price(price_data):
    """Returns raw KRW price without conversion"""
    try:
        krw_price = price_data.get('value', 0)
        return int(krw_price) if krw_price else 0
    except: return 0

def run_scraper():
    db = init_firestore()
    
    with sync_playwright() as p:
        # Launch Browser (Headless = Fast)
        browser = p.chromium.launch(headless=True) 
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        
        # Load Auth State if exists
        try:
            with open('state.json', 'r') as f:
                context.add_cookies(json.load(f)['cookies'])
            logger.info("✅ Loaded Cookies from state.json")
        except:
            logger.warning("⚠️ No state.json found. Running as guest.")

        # No need for a page instance for API calls, but we need it initialized
        # page = context.new_page() 

        for cat in CATEGORIES:
            logger.info(f"🚀 Scraping Category: {cat['name']}")
            total_synced = 0
            
            for page_num in range(100): # Max 100 pages
                api_url = f"{cat['base_url']}?q=:relevance&page={page_num}"
                logger.info(f"  >> Fetching Page {page_num}...")
                
                try:
                    # Use context.request to make the API call with cookies
                    response = context.request.get(api_url, headers={
                        "Accept": "application/json",
                        "Referer": "https://www.costco.co.kr/"
                    })
                    
                    if not response.ok:
                        logger.error(f"    x API Error: {response.status} {response.status_text}")
                        break
                        
                    # Get JSON directly
                    try:
                        data = response.json()
                    except Exception as e:
                        logger.warning(f"    x Failed to parse JSON on page {page_num}: {e}")
                        # Check body
                        body = response.text()
                        logger.info(f"      Response body preview: {body[:100]}")
                        break

                    # Parse Products
                    product_list = []
                    if "results" in data: product_list = data["results"]
                    elif "products" in data: product_list = data["products"]
                    
                    if not product_list:
                        logger.info("    -> No more products (End).")
                        break
                        
                    logger.info(f"    -> Found {len(product_list)} items.")
                    
                    # Batch Sync
                    batch = db.batch()
                    count = 0
                    
                    for item in product_list:
                        try:
                            name = item.get("name", "Unknown")
                            url = "https://www.costco.co.kr" + item.get("url", "")
                            code = item.get("code", "")
                            
                            price_info = item.get("price", {})
                            final_price, orig_price = calculate_price(price_info)
                            
                            main_image = ""
                            images = []
                            if "images" in item:
                                for img in item["images"]:
                                    i_url = img.get("url", "")
                                    if i_url:
                                        if not i_url.startswith("http"): i_url = "https://www.costco.co.kr" + i_url
                                        images.append(i_url)
                                if images: main_image = images[0]

                            doc_id = code if code else hashlib.md5(name.encode()).hexdigest()
                            
                            product_data = {
                                "id": str(doc_id),
                                "name": name,
                                "price": final_price,
                                "originalPrice": orig_price,
                                "image": main_image,
                                "images": images,
                                "category": cat['name'],
                                "source": "costco_kr_browser_api",
                                "url": url,
                                "updatedAt": time.time(),
                                "stock": item.get("stock", {}).get("stockLevelStatus", "inStock")
                            }
                            
                            ref = db.collection(u'products').document(str(doc_id))
                            batch.set(ref, product_data, merge=True)
                            count += 1
                        except: pass
                    
                    if count > 0:
                        batch.commit()
                        total_synced += count
                        logger.info(f"    -> Synced {count} items.")
                    
                    time.sleep(1) # Be nice
                    
                except Exception as e:
                    logger.error(f"Page Error: {e}")
                    break
            
            logger.info(f"✅ Finished {cat['name']}: {total_synced} total products.")
            
        browser.close()

if __name__ == "__main__":
    run_scraper()
