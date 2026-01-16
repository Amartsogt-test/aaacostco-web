import time
import json
import logging
import hashlib
from playwright.sync_api import sync_playwright
import firebase_admin
from firebase_admin import credentials, firestore
import os
from datetime import datetime

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')
logger = logging.getLogger(__name__)

# Constants
START_URL = "https://www.costco.co.kr/Electronics/c/cos_1"
MAX_ITEMS_TO_SCRAPE = 10000 # Effectively no limit for this category
HEADLESS = False

# Firebase Setup
# Use the file found in functions directory
cred_path = r"c:\Users\Batbileg\_Costco\functions\service-account.json"
db = None

try:
    if os.path.exists(cred_path):
        if not firebase_admin._apps:
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
        db = firestore.client()
        logger.info(f"✅ Firebase Connected using {cred_path}")
    else:
        logger.warning(f"⚠️ Credential file not found at {cred_path}. Running in DRY RUN mode.")
except Exception as e:
    logger.error(f"⚠️ Firebase Init Failed: {e}. Running in DRY RUN mode.")

def calculate_price(price_text):
    if not price_text: return 0, 0
    try:
        # Remove "원", ",", and whitespace
        clean_price = price_text.replace("원", "").replace(",", "").strip()
        price_val = int(clean_price)
        return price_val, price_val 
    except:
        return 0, 0

class CostcoScraper:
    def __init__(self, db_client):
        self.db = db_client
        self.items_scraped = 0
        self.visited_urls = set()

    def clear_firestore(self):
        if not self.db: return
        logger.info("🗑️ Clearing Firestore 'products' collection (Batch Mode)...")
        try:
            coll_ref = self.db.collection('products')
            docs = coll_ref.list_documents(page_size=500)
            batch = self.db.batch()
            count = 0
            deleted_total = 0
            
            for doc in docs:
                batch.delete(doc)
                count += 1
                deleted_total += 1
                
                if count >= 400:
                    batch.commit()
                    print(f"   Deleted {deleted_total} docs...", end='\r')
                    batch = self.db.batch()
                    count = 0
            
            if count > 0:
                batch.commit()
            
            logger.info(f"✅ Successfully deleted {deleted_total} documents.")
        except Exception as e:
            logger.error(f"❌ Failed to clear Firestore: {e}")

    def scrape(self):
        # 0. Clear Database First (Optional, uncomment if needed)
        # self.clear_firestore()

        with sync_playwright() as p:
            logger.info(f"🚀 Launching Browser (Headless={HEADLESS})...")
            browser = p.chromium.launch(headless=HEADLESS, slow_mo=1000)
            context = browser.new_context(viewport={"width": 1280, "height": 720})
            self.page = context.new_page()

            # Go Home first
            try:
                self.page.goto("https://www.costco.co.kr/", timeout=30000, wait_until="domcontentloaded")
                time.sleep(2)
            except: pass

            self.process_category(START_URL, depth=0)
            
            browser.close()
            logger.info("✅ Scraping Completed.")

    def process_category(self, url, depth):
        if self.items_scraped >= MAX_ITEMS_TO_SCRAPE:
            return
        if url in self.visited_urls:
            return
        self.visited_urls.add(url)
        
        indent = "  " * depth
        logger.info(f"{indent}📂 Visiting: {url}")
        
        try:
            self.page.goto(url, timeout=60000, wait_until="domcontentloaded")
            time.sleep(2) # Wait for render
        except Exception as e:
            logger.error(f"{indent}❌ Failed to load {url}: {e}")
            return

        # 1. Check for Products
        products = self.page.query_selector_all(".product-listing .product-item") or \
                   self.page.query_selector_all(".product-list-grid .product-item") or \
                   self.page.query_selector_all("cx-product-list-item")
        
        if products:
            logger.info(f"{indent}  -> Found {len(products)} products.")
            self.scrape_products(products)
        else:
            # 2. If no products, look for Sub-categories
            logger.info(f"{indent}  -> No products. Looking for Sub-categories...")
            
            # Selectors for subcategories
            # Based on debug findings: .category-node a, .category-link, etc.
            subcats = self.page.query_selector_all(".category-node a") or \
                      self.page.query_selector_all(".category-wrapper a") or \
                      self.page.query_selector_all(".category-link")
            
            links_to_visit = []
            for sc in subcats:
                href = sc.get_attribute("href")
                if href and "/c/" in href: # Ensure it's a category link
                    full_url = "https://www.costco.co.kr" + href
                    links_to_visit.append(full_url)
            
            # Remove duplicates
            links_to_visit = list(set(links_to_visit))
            
            logger.info(f"{indent}  -> Found {len(links_to_visit)} sub-categories.")
            
            for link in links_to_visit:
                if self.items_scraped >= MAX_ITEMS_TO_SCRAPE: break
                self.process_category(link, depth + 1)

    def scrape_products(self, products):
        # 1. Extract URLs first to avoid stale element errors during navigation
        product_urls = []
        for item in products:
            try:
                name_el = item.query_selector("a.product-name") or item.query_selector(".product-name-container a")
                if name_el:
                    href = name_el.get_attribute("href")
                    if href:
                        product_urls.append("https://www.costco.co.kr" + href)
            except: pass
            
        logger.info(f"    -> Found {len(product_urls)} products to scrape (Deep Mode)...")

        # 2. Visit each URL
        for url in product_urls:
            if self.items_scraped >= MAX_ITEMS_TO_SCRAPE: break
            if url in self.visited_urls: continue
            self.visited_urls.add(url)
            
            self.scrape_detail_page(url)

    def scrape_detail_page(self, url):
        try:
            logger.info(f"    📂 Visiting PDP: {url}")
            self.page.goto(url, timeout=60000, wait_until="domcontentloaded")
            
            # Wait for content
            try:
                self.page.wait_for_selector(".product-image-container img, img.product-image, .gallery-thumbnail", timeout=10000)
            except: 
                logger.warning("      ! Timeout waiting for images")
            
            time.sleep(5) # Extra buffer for JS
            
            # Scrape Data (PDP context)
            
            # Name
            name = "Unknown"
            try:
                name_el = self.page.query_selector("h1") or self.page.query_selector(".product-name")
                if name_el: name = name_el.inner_text().strip()
            except: pass
            
            # Price
            price, orig = 0, 0
            try:
                price_text = ""
                price_el = self.page.query_selector(".product-price") or self.page.query_selector(".price")
                if price_el: price_text = price_el.inner_text()
                price, orig = calculate_price(price_text)
            except: pass
            
            # Images (Gallery)
            images = []
            try:
                # Use JS to extract images robustly
                imgs = self.page.evaluate("""() => {
                    const srcs = [];
                    // 1. Gallery Thumbs
                    document.querySelectorAll('.gallery-thumbnail img').forEach(el => srcs.push(el.src || el.dataset.src));
                    // 2. Owl Carousel
                    document.querySelectorAll('.owl-item img').forEach(el => srcs.push(el.src || el.dataset.src));
                    // 3. Main Image container
                    document.querySelectorAll('.product-image-container img').forEach(el => srcs.push(el.src || el.dataset.src));
                    // 4. Any cx-media image in gallery usually
                    document.querySelectorAll('cx-media img').forEach(el => srcs.push(el.src || el.dataset.src));
                    return srcs.filter(s => s);
                }""")
                
                # Filter and clean
                for src in imgs:
                    if src and isinstance(src, str):
                       if not src.startswith("http"): src = "https://www.costco.co.kr" + src
                       # Filter out obvious icons
                       if "zoom" in src or "product" in src or "thumbnail" in src or "format" in src:
                           images.append(src)
                
                # Deduplicate
                images = list(dict.fromkeys(images))
                
                if not images:
                     logger.warning("      ! No images found. Saving screenshot.")
                     self.page.screenshot(path=f"debug_no_img_{doc_id[:5]}.png")
            except Exception as e:
                logger.error(f"Image scrape error: {e}")

            # Options (Variants)
            options = []
            try:
                # Try JS for options too
                opts = self.page.evaluate("""() => {
                    const res = [];
                    // Style Selectors (Color/Type)
                    document.querySelectorAll('.variant-list li img').forEach(el => {
                        res.push({name: "Option", value: el.title || el.alt});
                    });
                     // Text Selectors (Size)
                    document.querySelectorAll('.variant-list li span').forEach(el => {
                        if(el.innerText) res.push({name: "Size", value: el.innerText});
                    });
                    return res;
                }""")
                if opts: options = opts
            except: pass

            # ID (Extract code from URL)
            import re
            match = re.search(r"/p/(\w+)", url)
            if match:
                doc_id = match.group(1)
            else:
                # Fallback to hash if URL pattern fails
                doc_id = hashlib.md5(name.encode()).hexdigest()
            
            # Prepare Data
            product_data = {
                "id": doc_id,
                "name": name,
                "price": price,
                "originalPrice": orig,
                "image": images[0] if images else "",
                "images": images,
                "url": url,
                "options": options,
                "source": "visual_deep_recursive",
                "updatedAt": datetime.now().isoformat(),
                "stock": "inStock"
            }
            
            logger.info(f"      + Scraped: {name} | {len(images)} imgs | {len(options)} opts")
            
            # Save
            if self.db is not None:
                batch = self.db.batch()
                ref = self.db.collection('products').document(doc_id)
                batch.set(ref, product_data, merge=True)
                batch.commit()
                logger.info("      -> Saved to Firestore.")
            else:
                logger.info(f"      -> [DRY RUN] Would save {doc_id}")
            
            self.items_scraped += 1
            
        except Exception as e:
            logger.error(f"    ❌ Failed to scrape PDP {url}: {e}")

if __name__ == "__main__":
    scraper = CostcoScraper(db)
    scraper.scrape()
