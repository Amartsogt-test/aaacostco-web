"""
Full Sync Module - Runs daily at 6 AM
- Fetches all products from Costco API
- Detects new products
- Translates new products
- Checks for inactive products
"""

import os
import sys
import time
import json
import logging
import hashlib
from datetime import datetime
from playwright.sync_api import sync_playwright

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import firebase_admin
from firebase_admin import credentials, firestore
from config import FIREBASE_CREDENTIALS
from translator import translate_product

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ============ CATEGORIES TO SCRAPE ============
# Updated 2026-05-23: All 18 active Costco Korea categories
# API query type MUST be 'allCategories' (not 'category') for cos_X codes
# cos_13 and cos_16 are empty/inactive - excluded

CATEGORIES = [
    {"name": "디지털/TV/컴퓨터",       "name_en": "Electronics",         "code": "cos_1"},
    {"name": "가구/침구/인테리어",       "name_en": "Furniture/Bedding",   "code": "cos_2"},
    {"name": "유아동/완구/반려동물용품",   "name_en": "Baby/Toys/Pets",      "code": "cos_3"},
    {"name": "스포츠/헬스/캠핑",        "name_en": "Sports/Camping",      "code": "cos_4"},
    {"name": "파티오/정원/창고",        "name_en": "Patio/Garden",        "code": "cos_5"},
    {"name": "의류/가방/잡화",         "name_en": "Clothing/Bags",       "code": "cos_6"},
    {"name": "보석/시계/액세서리",       "name_en": "Jewelry/Watches",     "code": "cos_7"},
    {"name": "화장품/미용/제지",        "name_en": "Cosmetics/Beauty",    "code": "cos_8"},
    {"name": "공구/생활/자동차",        "name_en": "Tools/Auto",          "code": "cos_9"},
    {"name": "식품",                 "name_en": "Food",                "code": "cos_10"},
    {"name": "문구/사무",             "name_en": "Stationery/Office",   "code": "cos_11"},
    {"name": "건강/영양제",            "name_en": "Health/Supplements",  "code": "cos_12"},
    {"name": "대형/생활가전",           "name_en": "Appliances",          "code": "cos_14"},
    {"name": "홈/키친",              "name_en": "Home/Kitchen",        "code": "cos_15"},
    {"name": "비즈니스 딜리버리",        "name_en": "Business Delivery",   "code": "cos_17"},
    {"name": "그로서리",              "name_en": "Grocery",             "code": "cos_18"},
    {"name": "타이어",               "name_en": "Tires",               "code": "cos_19"},
    {"name": "타이어/자동차용품",        "name_en": "Tires/Auto Parts",    "code": "cos_20"},
]

# ============ FIREBASE INIT ============

def init_firestore():
    if not firebase_admin._apps:
        cred = credentials.Certificate(FIREBASE_CREDENTIALS)
        firebase_admin.initialize_app(cred)
    return firestore.client()

# ============ PRODUCT EXTRACTION ============

def extract_product_data(api_item: dict, category: dict) -> dict:
    """
    Extract all required fields from Costco API response
    """
    code = api_item.get('code', '')
    if not code:
        code = hashlib.md5(api_item.get('name', '').encode()).hexdigest()[:12]
    
    # Price info
    price_data = api_item.get('price', {})
    base_price_data = api_item.get('basePrice', {})
    
    price_krw = price_data.get('value', 0) if price_data else 0
    original_price_krw = base_price_data.get('value', price_krw) if base_price_data else price_krw
    
    # Discount calculation
    has_discount = original_price_krw > price_krw and price_krw > 0
    discount_percent = 0
    if has_discount:
        discount_percent = round((1 - price_krw / original_price_krw) * 100)
    
    # Images
    images = []
    for img in api_item.get('images', []):
        url = img.get('url', '')
        if url:
            if not url.startswith('http'):
                url = 'https://www.costco.co.kr' + url
            images.append(url)
    
    # Categories
    categories = []
    main_category = category['code']
    main_category_name = category['name']
    
    for cat in api_item.get('categories', []):
        cat_code = cat.get('code', '')
        if cat_code and cat_code.startswith('cos_'):
            categories.append({
                'code': cat_code,
                'name': cat.get('name', ''),
                'url': cat.get('url', '')
            })
            # Find the most specific category
            if cat_code.count('.') > main_category.count('.'):
                main_category = cat_code
                main_category_name = cat.get('name', '')
    
    # Specifications from classifications
    specifications = []
    for clf in api_item.get('classifications', []):
        features = clf.get('features', [])
        for feature in features:
            specs_name = feature.get('name', '')
            specs_values = feature.get('featureValues', [])
            if specs_values:
                specifications.append({
                    'name': specs_name,
                    'value': ', '.join([v.get('value', '') for v in specs_values])
                })
    
    # Stock status
    stock_data = api_item.get('stock', {})
    stock_status = stock_data.get('stockLevelStatus', 'inStock') if stock_data else 'inStock'
    
    # Build product data
    product = {
        # ID/URL
        'id': code,
        'url': 'https://www.costco.co.kr' + api_item.get('url', ''),
        'groupId': api_item.get('groupId', ''),
        
        # Name (original Korean)
        'name': api_item.get('name', ''),
        'englishName': api_item.get('englishName', ''),
        'summary': api_item.get('summary', ''),
        'description': api_item.get('description', ''),
        
        # Price (KRW only - calculation done client-side)
        'priceKRW': price_krw,
        'originalPriceKRW': original_price_krw,
        'hasDiscount': has_discount,
        'discountPercent': discount_percent,
        'discountMessage': api_item.get('discountMessage', ''),
        
        # Images
        'images': images,
        'image': images[0] if images else '',
        'badges': [d.get('text', '') for d in api_item.get('decalData', []) if d.get('text')],
        
        # Categories
        'categories': categories,
        'mainCategory': main_category,
        'mainCategoryName': main_category_name,
        
        # Specifications
        'specifications': specifications,
        'ingredients': api_item.get('ingredients', ''),
        
        # Brand
        'brand': api_item.get('manufacturer', ''),
        
        # Rating
        'rating': api_item.get('averageRating', 0),
        'reviewCount': api_item.get('numberOfReviews', 0),
        
        # Stock
        'stockStatus': stock_status,
        'purchasable': api_item.get('purchasable', True),
        
        # Policy
        'warranty': api_item.get('warranty', ''),
        'returns': api_item.get('returns', ''),
        
        # Status
        'status': 'active',
        'needsTranslation': True,  # Will be translated later
        
        # Source
        'source': 'costco_kr_api',
    }
    
    return product


# ============ FETCH FROM API ============
# IMPORTANT: Must use 'allCategories' query type (not 'category') for cos_X codes
# The REST search API is the only reliable way to get products by category

API_BASE = "https://www.costco.co.kr/rest/v2/korea/products/search"
PAGE_SIZE = 100

def fetch_all_products(context) -> list:
    """
    Fetch all products from Costco REST API using browser context.
    Uses 'allCategories' query type which is the only working method for cos_X codes.
    """
    all_products = []
    seen_codes = set()  # Deduplicate products across categories
    
    for category in CATEGORIES:
        cat_label = f"{category['name']} ({category.get('name_en', '')}) [{category['code']}]"
        logger.info(f"📦 Fetching category: {cat_label}")
        category_products = []
        
        for page_num in range(100):  # Max 100 pages per category
            # Use REST search API with allCategories query type
            api_url = (
                f"{API_BASE}?fields=products(FULL),pagination"
                f"&query=%3Arelevance%3AallCategories%3A{category['code']}"
                f"&pageSize={PAGE_SIZE}&currentPage={page_num}"
            )
            
            try:
                response = context.request.get(api_url, headers={
                    "Accept": "application/json",
                    "Referer": "https://www.costco.co.kr/"
                })
                
                if not response.ok:
                    logger.warning(f"  API error page {page_num}: {response.status}")
                    break
                
                try:
                    data = response.json()
                except:
                    logger.warning(f"  JSON parse error on page {page_num}")
                    break
                
                # REST API returns products in 'products' key
                products = data.get('products', [])
                pagination = data.get('pagination', {})
                total_pages = pagination.get('totalPages', 1)
                total_results = pagination.get('totalResults', 0)
                
                if page_num == 0:
                    logger.info(f"  Total: {total_results} products, {total_pages} pages")
                
                if not products:
                    logger.info(f"  No more products (page {page_num})")
                    break
                
                new_count = 0
                for item in products:
                    try:
                        code = item.get('code', '')
                        if code and code not in seen_codes:
                            product = extract_product_data(item, category)
                            category_products.append(product)
                            seen_codes.add(code)
                            new_count += 1
                    except Exception as e:
                        logger.error(f"  Error extracting product: {e}")
                
                logger.info(f"  Page {page_num}: {len(products)} fetched, {new_count} new")
                
                # Stop if we've reached the last page
                if page_num >= total_pages - 1:
                    break
                
                time.sleep(0.5)  # Rate limiting
                
            except Exception as e:
                logger.error(f"  Page {page_num} error: {e}")
                break
        
        logger.info(f"  ✓ {category['name']}: {len(category_products)} products")
        all_products.extend(category_products)
    
    logger.info(f"\n📊 Total unique products: {len(all_products)} (from {len(CATEGORIES)} categories)")
    return all_products


# ============ SYNC TO FIREBASE ============

def sync_to_firebase(db, products: list) -> dict:
    """
    Sync products to Firebase (optimized - only writes when data actually changed)
    Returns: list of new products that need translation
    """
    stats = {'new': 0, 'updated': 0, 'skipped': 0, 'pending_review': 0}
    
    # Read existing products with price/stock fields for comparison
    # This avoids unnecessary writes when nothing changed
    logger.info("📖 Reading existing products from Firebase...")
    existing_data = {}  # {id: {priceKRW, originalPriceKRW, discountPercent, stockStatus}}
    existing_docs = db.collection('products').select(
        ['priceKRW', 'originalPriceKRW', 'discountPercent', 'stockStatus', 'status', 'estimatedMarkupKrw']
    ).stream()
    for doc in existing_docs:
        d = doc.to_dict()
        existing_data[doc.id] = {
            'priceKRW': d.get('priceKRW', 0),
            'originalPriceKRW': d.get('originalPriceKRW', 0),
            'discountPercent': d.get('discountPercent', 0),
            'stockStatus': d.get('stockStatus', ''),
            'estimatedMarkupKrw': d.get('estimatedMarkupKrw'),
        }
    
    logger.info(f"  Found {len(existing_data)} existing products")
    
    # Current product IDs from API
    current_ids = set(p['id'] for p in products)
    
    # New products to translate
    new_products = []
    
    # Batch write
    batch = db.batch()
    batch_count = 0
    
    def commit_batch():
        nonlocal batch, batch_count
        if batch_count > 0:
            batch.commit()
            batch = db.batch()
            batch_count = 0
    
    for product in products:
        product_id = product['id']
        doc_ref = db.collection('products').document(product_id)
        
        if product_id not in existing_data:
            # ── New product ──
            product['createdAt'] = firestore.SERVER_TIMESTAMP
            product['lastSeenAt'] = firestore.SERVER_TIMESTAMP
            
            default_markup = 0 if product['priceKRW'] > 100000 else 2000
            product['estimatedMarkupKrw'] = default_markup
            product['estimatedWarehousePrice'] = max(0, product['priceKRW'] - default_markup)
            
            batch.set(doc_ref, product)
            new_products.append(product)
            stats['new'] += 1
            batch_count += 1
        else:
            # ── Existing product - only update if price/stock actually changed ──
            old = existing_data[product_id]
            price_changed = (
                old['priceKRW'] != product['priceKRW'] or
                old['originalPriceKRW'] != product['originalPriceKRW'] or
                old['discountPercent'] != product['discountPercent']
            )
            stock_changed = old['stockStatus'] != product['stockStatus']
            
            if price_changed or stock_changed:
                update_data = {
                    'priceKRW': product['priceKRW'],
                    'originalPriceKRW': product['originalPriceKRW'],
                    'hasDiscount': product['hasDiscount'],
                    'discountPercent': product['discountPercent'],
                    'discountMessage': product['discountMessage'],
                    'stockStatus': product['stockStatus'],
                    'lastSeenAt': firestore.SERVER_TIMESTAMP,
                    'updatedAt': firestore.SERVER_TIMESTAMP,
                }
                if price_changed:
                    update_data['priceHistory'] = firestore.ArrayUnion([{
                        'price': product['priceKRW'],
                        'originalPrice': product['originalPriceKRW'],
                        'date': datetime.now().strftime('%Y-%m-%d'),
                    }])
                    
                    markup = old.get('estimatedMarkupKrw')
                    if markup is None:
                        markup = 0 if product['priceKRW'] > 100000 else 2000
                    update_data['estimatedWarehousePrice'] = max(0, product['priceKRW'] - markup)
                batch.update(doc_ref, update_data)
                stats['updated'] += 1
                batch_count += 1
            else:
                # Nothing changed - skip write entirely
                stats['skipped'] += 1
        
        # Commit batch every 400 operations
        if batch_count >= 400:
            commit_batch()
    
    # Commit remaining
    commit_batch()
    
    # ── Mark products not seen in API as pendingReview ──
    missing_ids = set(existing_data.keys()) - current_ids
    if missing_ids:
        logger.warning(f"⚠️ {len(missing_ids)} products not found in API")
        for pid in missing_ids:
            doc_ref = db.collection('products').document(pid)
            batch.update(doc_ref, {
                'status': 'pendingReview',
                'pendingReviewReason': 'API-д олдохгүй байна',
                'pendingReviewAt': firestore.SERVER_TIMESTAMP
            })
            stats['pending_review'] += 1
            batch_count += 1
            
            if batch_count >= 400:
                commit_batch()
        
        commit_batch()
    
    logger.info(f"📊 Sync: {stats['new']} new, {stats['updated']} updated, {stats['skipped']} skipped (unchanged), {stats['pending_review']} pending review")
    logger.info(f"💰 Firebase writes saved: {stats['skipped']} (skipped unchanged products)")
    
    return new_products


# ============ TRANSLATE NEW PRODUCTS ============

def translate_new_products(db, new_products: list):
    """
    Translate newly added products
    """
    if not new_products:
        logger.info("No new products to translate")
        return
    
    logger.info(f"🌐 Translating {len(new_products)} new products...")
    
    for i, product in enumerate(new_products):
        try:
            translations = translate_product(product)
            
            # Update Firebase with translations
            db.collection('products').document(product['id']).update({
                **translations,
                'translatedAt': firestore.SERVER_TIMESTAMP
            })
            
            logger.info(f"  [{i+1}/{len(new_products)}] Translated: {product['name'][:40]}...")
            
            # Rate limiting for translation APIs
            time.sleep(0.5)
            
        except Exception as e:
            logger.error(f"  Translation error for {product['id']}: {e}")


# ============ MAIN ============

def run_full_sync(max_products: int = None, skip_translate: bool = False):
    """
    Run full product sync
    Args:
        max_products: Limit number of products (for testing)
        skip_translate: Skip translation (for testing)
    """
    start_time = datetime.now()
    logger.info(f"🚀 Full Sync Started at {start_time}")
    
    db = init_firestore()
    
    with sync_playwright() as p:
        # Launch browser
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        )
        
        # Load cookies if available (Try local state.json, fallback to Firestore settings/scraper)
        cookies_loaded = False
        try:
            with open('state.json', 'r') as f:
                context.add_cookies(json.load(f)['cookies'])
            logger.info("✓ Loaded cookies from state.json")
            cookies_loaded = True
        except:
            pass

        if not cookies_loaded:
            try:
                doc = db.collection('settings').document('scraper').get()
                if doc.exists:
                    data = doc.to_dict()
                    cookie_str = data.get('cookie', '')
                    if cookie_str:
                        playwright_cookies = []
                        for cookie_part in cookie_str.split(';'):
                            cookie_part = cookie_part.strip()
                            if '=' in cookie_part:
                                name, val = cookie_part.split('=', 1)
                                playwright_cookies.append({
                                    'name': name.strip(),
                                    'value': val.strip(),
                                    'domain': '.costco.co.kr',
                                    'path': '/'
                                })
                        if playwright_cookies:
                            context.add_cookies(playwright_cookies)
                            logger.info(f"✓ Loaded {len(playwright_cookies)} cookies from Firestore settings/scraper")
                            cookies_loaded = True
            except Exception as e:
                logger.warning(f"Failed to load cookies from Firestore: {e}")

        if not cookies_loaded:
            logger.info("No saved cookies found, running as guest")
        
        # Visit home page first
        page = context.new_page()
        try:
            page.goto("https://www.costco.co.kr/", wait_until="domcontentloaded", timeout=15000)
            time.sleep(2)
        except:
            pass
        
        # Fetch all products
        products = fetch_all_products(context)
        
        if max_products:
            products = products[:max_products]
        
        logger.info(f"📦 Total products fetched: {len(products)}")
        
        browser.close()
    
    # Sync to Firebase
    new_products = sync_to_firebase(db, products)
    
    # Translate new products
    if not skip_translate and new_products:
        translate_new_products(db, new_products)
    
    end_time = datetime.now()
    duration = (end_time - start_time).total_seconds()
    logger.info(f"✅ Full Sync completed in {duration:.1f}s")


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser()
    parser.add_argument('--max', type=int, help='Max products to fetch (for testing)')
    parser.add_argument('--skip-translate', action='store_true', help='Skip translation')
    parser.add_argument('--test', action='store_true', help='Test mode: fetch 10 products')
    
    args = parser.parse_args()
    
    if args.test:
        run_full_sync(max_products=10, skip_translate=True)
    else:
        run_full_sync(
            max_products=args.max,
            skip_translate=args.skip_translate
        )
