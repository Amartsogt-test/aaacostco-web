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

CATEGORIES = [
    {"name": "Electronics", "code": "cos_1", "url": "https://www.costco.co.kr/Electronics/c/cos_1/results"},
    {"name": "Computers", "code": "cos_2", "url": "https://www.costco.co.kr/Computers/c/cos_2/results"},
    {"name": "Appliances", "code": "cos_3", "url": "https://www.costco.co.kr/Appliances/c/cos_3/results"},
    {"name": "Grocery", "code": "cos_4", "url": "https://www.costco.co.kr/Grocery/c/cos_4/results"},
    {"name": "Health", "code": "cos_5", "url": "https://www.costco.co.kr/Health-Beauty/c/cos_5/results"},
    {"name": "Home", "code": "cos_6", "url": "https://www.costco.co.kr/Home-Kitchen-Patio-Garden/c/cos_6/results"},
    {"name": "Baby", "code": "cos_7", "url": "https://www.costco.co.kr/Baby-Kids-Toys/c/cos_7/results"},
    {"name": "Sports", "code": "cos_8", "url": "https://www.costco.co.kr/Sports-Outdoor/c/cos_8/results"},
    {"name": "Clothing", "code": "cos_9", "url": "https://www.costco.co.kr/Clothing-Luggage/c/cos_9/results"},
    {"name": "Office", "code": "cos_10", "url": "https://www.costco.co.kr/Office-Products/c/cos_10/results"},
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
        
        # Timestamps (will be set by Firebase)
        'lastSeenAt': firestore.SERVER_TIMESTAMP,
    }
    
    return product


# ============ FETCH FROM API ============

def fetch_all_products(context) -> list:
    """
    Fetch all products from Costco API using browser context
    """
    all_products = []
    
    for category in CATEGORIES:
        logger.info(f"📦 Fetching category: {category['name']}")
        category_products = []
        
        for page_num in range(100):  # Max 100 pages per category
            api_url = f"{category['url']}?q=:relevance&page={page_num}"
            
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
                
                # Get products from response
                products = data.get('results', []) or data.get('products', [])
                
                if not products:
                    logger.info(f"  No more products (page {page_num})")
                    break
                
                for item in products:
                    try:
                        product = extract_product_data(item, category)
                        category_products.append(product)
                    except Exception as e:
                        logger.error(f"  Error extracting product: {e}")
                
                logger.info(f"  Page {page_num}: {len(products)} products")
                time.sleep(0.5)  # Rate limiting
                
            except Exception as e:
                logger.error(f"  Page {page_num} error: {e}")
                break
        
        logger.info(f"  ✓ {category['name']}: {len(category_products)} total products")
        all_products.extend(category_products)
    
    return all_products


# ============ SYNC TO FIREBASE ============

def sync_to_firebase(db, products: list) -> dict:
    """
    Sync products to Firebase
    Returns: {new: count, updated: count, pending_review: count}
    """
    stats = {'new': 0, 'updated': 0, 'pending_review': 0}
    
    # Get existing product IDs
    existing_ids = set()
    existing_docs = db.collection('products').select(['id', 'status']).stream()
    for doc in existing_docs:
        existing_ids.add(doc.id)
    
    # Current product IDs from API
    current_ids = set(p['id'] for p in products)
    
    # New products to translate
    new_products = []
    
    # Batch write
    batch = db.batch()
    batch_count = 0
    
    for product in products:
        product_id = product['id']
        doc_ref = db.collection('products').document(product_id)
        
        if product_id not in existing_ids:
            # New product
            product['createdAt'] = firestore.SERVER_TIMESTAMP
            batch.set(doc_ref, product)
            new_products.append(product)
            stats['new'] += 1
        else:
            # Existing product - update fields but preserve translations
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
            batch.update(doc_ref, update_data)
            stats['updated'] += 1
        
        batch_count += 1
        
        # Commit batch every 400 operations
        if batch_count >= 400:
            batch.commit()
            batch = db.batch()
            batch_count = 0
    
    # Commit remaining
    if batch_count > 0:
        batch.commit()
    
    # Check for products not seen in API (potential inactive)
    missing_ids = existing_ids - current_ids
    if missing_ids:
        logger.warning(f"⚠️ {len(missing_ids)} products not found in API")
        batch = db.batch()
        for pid in list(missing_ids)[:400]:  # Limit batch size
            doc_ref = db.collection('products').document(pid)
            batch.update(doc_ref, {
                'status': 'pendingReview',
                'pendingReviewReason': 'API-д олдохгүй байна',
                'pendingReviewAt': firestore.SERVER_TIMESTAMP
            })
            stats['pending_review'] += 1
        batch.commit()
    
    logger.info(f"📊 Sync complete: {stats['new']} new, {stats['updated']} updated, {stats['pending_review']} pending review")
    
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
        
        # Load cookies if available
        try:
            with open('state.json', 'r') as f:
                context.add_cookies(json.load(f)['cookies'])
            logger.info("✓ Loaded cookies from state.json")
        except:
            logger.info("No saved cookies, running as guest")
        
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
