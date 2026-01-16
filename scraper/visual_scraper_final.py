import time
import hashlib
import logging
from playwright.sync_api import sync_playwright
import firebase_admin
from firebase_admin import credentials, firestore

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')
logger = logging.getLogger(__name__)

# Constants
CATEGORY_URL = "https://www.costco.co.kr/Electronics/TV/c/cos_1.1"

# Setup Firebase (Mock or Real)
# Assuming credentials are set up in environment or passed explicitly
# For this test we will just Print, but keeping structure ready.

def run_scraper():
    logger.info("🚀 LAUNCHING VISUAL SCRAPER (TV)...")
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, slow_mo=1000)
        context = browser.new_context(viewport={"width": 1280, "height": 720})
        page = context.new_page()
        
        logger.info("  > Navigating to TV Category...")
        page.goto(CATEGORY_URL, timeout=60000, wait_until="domcontentloaded")
        
        # Wait for product list
        try:
            # Try multiple selectors that might contain products
            page.wait_for_selector(".product-listing", timeout=10000)
            logger.info("  > Found .product-listing")
        except:
            logger.warning("  ! .product-listing not found. Checking alternatives...")
        
        # Extract Products
        # Based on typical Spartacus structure
        items = page.query_selector_all("cx-product-list-item") or \
                page.query_selector_all(".product-item") or \
                page.query_selector_all("a.product-name")
                
        if not items:
            # Fallback: Find elements via price
             items = page.evaluate("""() => {
                const hits = [];
                const all = document.querySelectorAll('*');
                for(let el of all) {
                   if(el.innerText && el.innerText.includes('원') && el.innerText.includes('TV')) {
                       // Walk up to find the card container
                       let parent = el.parentElement;
                       for(let i=0; i<3; i++) {
                           if(parent && parent.className.includes('product')) return [parent]; // Mock return for python
                           if(parent) parent = parent.parentElement;
                       }
                   }
                }
                return []; 
             }""")
             # The above JS eval is tricky to return elements to python directly if not handles.
             # Let's stick to standard selectors.
             
        # Re-query with broad selector
        items = page.query_selector_all(".product-item") 
        if not items:
             # Try finding links that contain /p/ (product URLs usually have /p/)
             items = page.query_selector_all("a[href*='/p/']")
             logger.info(f"  > Found {len(items)} potential product links.")

        if items:
            logger.info(f"✅ Found {len(items)} items. Scraping first 5...")
            for i, item in enumerate(items[:5]):
                try:
                    # If item is <a> tag
                    if await_tag_name(item) == 'A':
                        url = "https://www.costco.co.kr" + item.get_attribute("href")
                        name = item.inner_text().strip()
                        print(f"  [{i+1}] {name} -> {url}")
                    else:
                        # Try to find name inside
                        name_el = item.query_selector("a.product-name") or item.query_selector(".product-name-container a")
                        if name_el:
                            print(f"  [{i+1}] {name_el.inner_text().strip()}")
                except: pass
        else:
            logger.error("❌ Still no products found on TV page.")
            page.screenshot(path="debug_tv_fail.png")
            
        time.sleep(10)
        browser.close()

def await_tag_name(handle):
    return handle.evaluate("el => el.tagName")

if __name__ == "__main__":
    run_scraper()
