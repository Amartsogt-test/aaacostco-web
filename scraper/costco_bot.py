from playwright.sync_api import sync_playwright
import time
import random
import logging
from config import COSTCO_USER, COSTCO_PASS, HEADLESS, SLOW_MO

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class CostcoScraper:
    def __init__(self):
        self.playwright = None
        self.browser = None
        self.page = None

    def start(self):
        self.playwright = sync_playwright().start()
        self.browser = self.playwright.chromium.launch(headless=HEADLESS, slow_mo=SLOW_MO)
        
        # Try to load saved session
        try:
            self.context = self.browser.new_context(
                storage_state="state.json",
                viewport={'width': 1280, 'height': 800},
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            )
            logger.info("Loaded saved session (cookies).")
        except:
            logger.info("No saved session found. Starting fresh.")
            self.context = self.browser.new_context(
                viewport={'width': 1280, 'height': 800},
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            )
            
        self.page = self.context.new_page()

    def login(self):
        logger.info("Checking login status...")
        self.page.goto("https://www.costco.co.kr/my-account")
        time.sleep(3)

        if "login" in self.page.url:
            logger.info("Not logged in. Attempting auto-fill...")
            try:
                self.page.fill("#j_username", COSTCO_USER)
                self.page.fill("#j_password", COSTCO_PASS)
                # Try clicking, but ignore if it fails (user might have clicked)
                self.page.click("#loginForm > div > button", timeout=5000) 
            except Exception as e:
                logger.warning(f"Auto-fill/click issue: {e}. Please finish login manually.")

            logger.info("⚠️  PLEASE LOG IN MANUALLY ⚠️")
            logger.info("I am waiting for you to reach the 'My Account' page successfully.")
            logger.info("Waiting 3 minutes...")
            
            try:
                # Wait for manual confirmation from the agent (via send_command_input)
                logger.info("WAITING FOR MANUAL CONFIRMATION...")
                print(">> PLEASE LOGIN IN BROWSER, THEN PRESS ENTER IN TERMINAL <<")
                input() 
                
                logger.info("Manual confirmation received! Saving session...")
                self.context.storage_state(path="state.json")
            except Exception as e:
                logger.warning(f"Error saving session: {e}")
        else:
            logger.info("Already logged in with saved session.") 

    def calculate_price(self, original_price_text):
        try:
            # Handle "Member Only" or empty text
            if not original_price_text or "회원" in original_price_text or "Sign in" in original_price_text:
                return 0, 0

            # Remove "Won" symbol, "원", and commas
            clean_price = original_price_text.replace('₩', '').replace('원', '').replace(',', '').strip()
            krw_price = float(clean_price)
            
            from config import EXCHANGE_RATE, MARGIN_MULTIPLIER, SHIPPING_PER_KG, DEFAULT_WEIGHT_ESTIMATE
            
            # Use: Cost_MNT = (Price_KRW * Rate) + Shipping_MNT
            # Final_Price = Cost_MNT * Margin
            
            cost_mnt = (krw_price * EXCHANGE_RATE) + (SHIPPING_PER_KG * DEFAULT_WEIGHT_ESTIMATE)
            final_price = cost_mnt * MARGIN_MULTIPLIER
            
            return int(final_price), int(krw_price)
        except Exception as e:
            # logger.error(f"Price calc error: {e}") # Reduce noise
            return 0, 0

    def scrape_product_detail(self, url):
        # Extract product ID from URL
        import re
        try:
            # Pattern matches /p/NUMBER or at end of URL
            product_id = re.search(r"/p/(\w+)", url)
            if not product_id:
                 # Fallback: maybe just numbers at end
                 product_id = re.search(r"(\d+)$", url)
            
            if product_id:
                pid = product_id.group(1)
                # logger.info(f"  > Fetching API for Product ID: {pid}")
                
                # API Call to get Full Image Data AND Options
                api_url = f"https://www.costco.co.kr/rest/v2/korea/products/{pid}?fields=FULL&lang=en&curr=KRW"
                
                headers = {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Referer": "https://www.costco.co.kr/",
                    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7"
                }
                
                time.sleep(random.uniform(0.5, 1.5))
                
                response = self.page.request.get(api_url, headers=headers)
                if response.status == 200:
                    data = response.json()
                    
                    # 1. Image Extraction
                    gallery_images = []
                    
                    # 0. NEW: Extract Product ID & Unit Price & PROMO STATUS
                    product_id_val = data.get("code")
                    unit_price = None
                    
                    # Check for Active Promotions
                    potential_promos = data.get("potentialPromotions", [])
                    has_promo = len(potential_promos) > 0
                    
                    price_obj = data.get("price", {})
                    # Strategy 1
                    if "supplementaryPriceLabel" in price_obj:
                        unit_price = price_obj["supplementaryPriceLabel"]
                    
                    # Strategy 2
                    if not unit_price:
                        up_obj = data.get("unitPrice") or price_obj.get("unitPrice")
                        if isinstance(up_obj, dict):
                            unit_price = up_obj.get("formattedValue") or up_obj.get("supplementaryPriceLabel")
                    
                    # Strategy 3
                    if not unit_price and potential_promos and isinstance(potential_promos[0], dict):
                         unit_price = potential_promos[0].get("supplementaryPriceLabel")

                    if 'images' in data:
                        zooms = [img['url'] for img in data['images'] if img.get('format') == 'zoom']
                        if not zooms: zooms = [img['url'] for img in data['images'] if img.get('format') == 'product']
                        if not zooms: zooms = [img['url'] for img in data['images'] if img.get('format') == 'thumbnail']

                        for z in zooms:
                            if not z.startswith("http"): z = "https://www.costco.co.kr" + z
                            gallery_images.append(z)
                    
                    # 2. Key Options
                    options = []
                    if 'classifications' in data:
                        for cls in data['classifications']:
                            if 'features' in cls:
                                for feat in cls['features']:
                                    if 'color' in feat.get('code', '') or 'size' in feat.get('code', ''):
                                        feat_name = feat.get('name', 'Option')
                                        feat_values = [v.get('value') for v in feat.get('featureValues', [])]
                                        options.append({"name": feat_name, "values": feat_values})

                    variants = []
                    if 'variantOptions' in data:
                        for v in data['variantOptions']:
                            v_code = v.get('code')
                            v_stock = v.get('stock', {}).get('stockLevelStatus', 'unknown')
                            v_price_data = v.get('priceData', {})
                            v_price = v_price_data.get('value')
                            
                            v_attrs = []
                            if 'variantOptionQualifiers' in v:
                                for q in v['variantOptionQualifiers']:
                                    v_attrs.append(f"{q.get('name')}: {q.get('value')}")
                            
                            variants.append({
                                "code": v_code,
                                "attributes": ", ".join(v_attrs),
                                "price": v_price,
                                "stock": v_stock
                            })

                    # Return tuple: images, options, variants, pid, unit_price, has_promo
                    seen = set()
                    unique_images = [x for x in gallery_images if not (x in seen or seen.add(x))]
                    
                    return unique_images, options, variants, product_id_val, unit_price, has_promo
        
        except Exception as e:
            logger.warning(f"  > API fetch failed for {url}: {e}")

        # FALLBACK
        logger.info(f"  > Fallback to DOM scraping for: {url}")
        try:
            self.page.goto(url)
            try:
                self.page.wait_for_selector(".gallery-thumbnail img", timeout=3000)
            except: pass
            
            images = []
            thumbs = self.page.query_selector_all(".gallery-thumbnail img")
            if not thumbs:
                main_img = self.page.query_selector(".product-image-container img") or self.page.query_selector("img.product-image")
                if main_img: thumbs = [main_img]

            for t in thumbs:
                src = t.get_attribute("src")
                if src:
                    if not src.startswith("http"): src = "https://www.costco.co.kr" + src
                    images.append(src)
            
            seen = set()
            return [x for x in images if not (x in seen or seen.add(x))], [], [], None, None, False
        except Exception as e:
            logger.warning(f"  > DOM Scraping failed: {e}")
            return [], [], [], None, None, False

    def scrape_category(self, category_url, category_name="general", depth=0):
        if depth > 3:
            logger.warning(f"Max depth reached at {category_url}")
            return []

        logger.info(f"[{depth}] Scraping URL: {category_url}")
        try:
            self.page.goto(category_url)
        except Exception as e:
            logger.error(f"Failed to load {category_url}: {e}")
            return []

        time.sleep(5) 
        
        # Scroll to ensure things load
        for _ in range(2):
            self.page.mouse.wheel(0, 1000)
            time.sleep(1)

        # 1. Check for Products (Initial Check)
        # If we see products, we enter "Pagination Mode" for this category
        initial_products = self.page.query_selector_all("sip-product-list-item") or self.page.query_selector_all(".product-item")
        
        if len(initial_products) > 0:
            logger.info(f"  > Found products. Starting PAGINATION scraping for: {category_url}")
            
            all_scraped_data = []
            page_num = 0
            
            while True:
                logger.info(f"  >> Scraping Page {page_num}...")
                
                # Construct Page URL (Hybris style: ?page=N)
                # Ensure we handle existing params
                if "?" in category_url:
                    page_url = f"{category_url}&page={page_num}"
                else:
                    page_url = f"{category_url}?page={page_num}"
                
                # Navigate to page (skip 0 if we are already there? No, explicit ensures cleanliness)
                try:
                    self.page.goto(page_url)
                    time.sleep(4) # Wait for load
                    # Scroll
                    self.page.mouse.wheel(0, 1000)
                    time.sleep(1)
                except Exception as e:
                    logger.error(f"Failed page navig: {e}")
                    break

                # Collect products on THIS page
                product_elements = self.page.query_selector_all("sip-product-list-item") 
                if len(product_elements) == 0:
                     product_elements = self.page.query_selector_all(".product-item")
                
                if len(product_elements) == 0:
                    logger.info("  >> No more products found on this page. Stopping pagination.")
                    break
                
                logger.info(f"  >> Page {page_num}: Found {len(product_elements)} items.")
                
                # Extract Links
                products_to_visit = []
                for i, p in enumerate(product_elements):
                    try:
                        name_el = p.query_selector(".lister-name-en") or p.query_selector(".lister-name") or p.query_selector(".product-name-container a")
                        price_el = p.query_selector(".product-price-amount") or p.query_selector(".price-value")
                        
                        if name_el and price_el:
                            name = name_el.inner_text().strip()
                            price_text = price_el.inner_text().strip()
                            
                            link_el = name_el if name_el.get_attribute("href") else p.query_selector("a")
                            href = link_el.get_attribute("href")
                            if href:
                                 if not href.startswith("http"): href = "https://www.costco.co.kr" + href
                                 products_to_visit.append({ "name": name, "price_text": price_text, "url": href })
                    except: pass
                
                if not products_to_visit:
                    break

                # Scrape Details for these items
                for item in products_to_visit:
                    try:
                        images, options, variants, pid, unit_price, has_promo = self.scrape_product_detail(item['url'])
                        main_image = images[0] if images else ""
                        final_price, original_price = self.calculate_price(item['price_text'])
                        
                        if final_price > 0:
                             product_data = {
                                "name": item['name'],
                                "price": final_price,
                                "originalPrice": original_price,
                                "image": main_image,
                                "images": images,
                                "options": options,       
                                "variants": variants,
                                "productId": pid,
                                "unitPrice": unit_price,
                                "category": category_name,
                                "source": "costco_kr",
                                "url": item['url'],
                                "updatedAt": time.time(),
                                "hasPromo": has_promo
                            }
                             self.sync_to_firestore([product_data]) 
                             all_scraped_data.append(product_data)
                             # logger.info(f"   + Synced: {item['name']}")
                    except Exception as e:
                        logger.error(f"Error processing item {item['name']}: {e}")
                
                # Check if this was the last page?
                # If we found less items than a full page (usually 24 or 48), we are done.
                if len(product_elements) < 12: # Heuristic: if very few items, likely last page
                    logger.info("  >> Small number of items, likely last page.")
                    break
                
                # Increment and Loop
                page_num += 1
                time.sleep(random.uniform(2, 4)) # Delay between pages
            
            return all_scraped_data

        # 1.B. IF NO PRODUCTS -> Check Sub-categories
        else:
            logger.info("  > No products found. Checking for sub-categories...")
            
            # Selectors for sub-categories
            # Based on inspection: .category-link is common for tiles
            sub_cats = self.page.query_selector_all(".category-link")
            if not sub_cats:
                 # Fallback: sometimes links in specific grids
                 sub_cats = self.page.query_selector_all(".category-node-list a") 

            if sub_cats:
                sub_links = []
                for sc in sub_cats:
                    href = sc.get_attribute("href")
                    if href:
                        if not href.startswith("http"): href = "https://www.costco.co.kr" + href
                        sub_links.append(href)
                
                # De-duplicate
                sub_links = list(set(sub_links))
                logger.info(f"  > Found {len(sub_links)} sub-categories. Recursively scraping...")
                
                all_data = []
                for link in sub_links:
                    data = self.scrape_category(link, category_name, depth + 1)
                    all_data.extend(data)
                
                return all_data
            else:
                 logger.warning("  > Dead end. No products or sub-categories found.")
                 return []

    def clear_firestore(self):
        import firebase_admin
        from firebase_admin import credentials, firestore
        from config import FIREBASE_CREDENTIALS

        if not firebase_admin._apps:
            cred = credentials.Certificate(FIREBASE_CREDENTIALS)
            firebase_admin.initialize_app(cred)

        db = firestore.client()
        products_ref = db.collection(u'products')
        docs = products_ref.list_documents(page_size=100)
        
        deleted_count = 0
        for doc in docs:
            doc.delete()
            deleted_count += 1
            
        logger.info(f"⚠️  CLEARED DATABASE: Deleted {deleted_count} products.")

    def sync_to_firestore(self, products):
        import firebase_admin
        from firebase_admin import credentials, firestore
        from config import FIREBASE_CREDENTIALS

        if not firebase_admin._apps:
            cred = credentials.Certificate(FIREBASE_CREDENTIALS)
            firebase_admin.initialize_app(cred)

        db = firestore.client()
        batch = db.batch()
        
        import hashlib

        for p in products:
            doc_id = hashlib.md5(p['name'].encode('utf-8')).hexdigest()
            doc_ref = db.collection(u'products').document(doc_id)
            
            # Check for Manual Override & Promo Status
            try:
                doc_snap = doc_ref.get()
                has_promo_official = p.pop('hasPromo', False) # Remove helper field before save

                if doc_snap.exists:
                    existing_data = doc_snap.to_dict()
                    is_manual = existing_data.get('isManualPrice') is True

                    # LOGIC:
                    # 1. If Official Promo ENDED (has_promo_official == False) AND isManualPrice == True:
                    #    -> FORCE UNLOCK & UPDATE (Revert to base price)
                    if is_manual and not has_promo_official:
                        logger.info(f"   ! PROMO ENDED for {p['name']}. Unlocking manual price and reverting.")
                        p['isManualPrice'] = False
                        p['discountEndDate'] = None # Clear custom end date
                        # 'price' and 'originalPrice' in 'p' are already the new scraped values (base price), 
                        # so we just let them overwrite.

                    # 2. If Official Promo ACTIVE or No Manual Lock:
                    #    -> Respect Lock if exists, otherwise update.
                    elif is_manual:
                        logger.info(f"   * Skipping PRICE update for locked item: {p['name']}")
                        p.pop('price', None)
                        p.pop('weight', None)
                        # We still might update stock, image, etc.
            except Exception as e:
                logger.warning(f"Error checking doc {doc_id}: {e}")

            batch.set(doc_ref, p, merge=True) 
        
        batch.commit()
        # logger.info(f"Synced {len(products)} products to Firestore.")

    def close(self):
        if self.browser:
            self.browser.close()
        if self.playwright:
            self.playwright.stop()

if __name__ == "__main__":
    if not COSTCO_USER or not COSTCO_PASS:
        logger.error("Please set COSTCO_USER and COSTCO_PASS in .env file")
    else:
        bot = CostcoScraper()
        try:
            bot.start()
            # bot.login() # Skipped as per user request to run without login
            
            # CLEAR DATABASE FIRST as requested
            logger.info("!! DELETING ALL EXISTING DATA FROM FIREBASE !!")
            bot.clear_firestore()
            
            # Define major categories
            # Define major categories
            categories = [
                {"name": "Electronics", "url": "https://www.costco.co.kr/c/cos_1"},
                {"name": "Appliances", "url": "https://www.costco.co.kr/c/cos_14"},
                {"name": "Furniture", "url": "https://www.costco.co.kr/c/cos_2"},
                {"name": "Kitchen", "url": "https://www.costco.co.kr/c/cos_15"},
                {"name": "Baby_Toys", "url": "https://www.costco.co.kr/c/cos_3"},
                {"name": "Sports", "url": "https://www.costco.co.kr/c/cos_4"},
                {"name": "Fashion", "url": "https://www.costco.co.kr/c/cos_6"},
                {"name": "Beauty", "url": "https://www.costco.co.kr/c/cos_8"},
                {"name": "Health", "url": "https://www.costco.co.kr/c/cos_12"},
                {"name": "Food", "url": "https://www.costco.co.kr/c/cos_10"}
            ]

            logger.info(f"Starting batch scrape of {len(categories)} categories...")

            for cat in categories:
                logger.info(f"--- Processing Category: {cat['name']} ---")
                try:
                    bot.scrape_category(cat['url'], category_name=cat['name'])
                    # Data is synced incrementally within the function now
                    
                    # Sleep between categories to be safe
                    time.sleep(5)
                except Exception as e:
                    logger.error(f"Failed category {cat['name']}: {e}")
            
            print("All categories processed.")
            print(">> PROCESS COMPLETE. Press Enter to close the browser... <<")
            input()
        except Exception as e:
            logger.error(f"Error: {e}")
            print("An error occurred. Browser will remain open. Press Enter to close...")
            input()
        finally:
            print("Closing browser...")
            if 'bot' in locals():
                bot.close()
