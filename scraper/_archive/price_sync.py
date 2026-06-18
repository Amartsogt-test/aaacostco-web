"""
Price Sync Module - Runs every 4 hours
- Updates only price-related fields
- Detects discount changes
- Fast execution (no translation)
"""

import os
import sys
import time
import json
import logging
from datetime import datetime
from playwright.sync_api import sync_playwright

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import firebase_admin
from firebase_admin import credentials, firestore
from config import FIREBASE_CREDENTIALS

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# All categories
CATEGORIES = [
    {"code": "cos_1", "url": "https://www.costco.co.kr/Electronics/c/cos_1/results"},
    {"code": "cos_2", "url": "https://www.costco.co.kr/Computers/c/cos_2/results"},
    {"code": "cos_3", "url": "https://www.costco.co.kr/Appliances/c/cos_3/results"},
    {"code": "cos_4", "url": "https://www.costco.co.kr/Grocery/c/cos_4/results"},
    {"code": "cos_5", "url": "https://www.costco.co.kr/Health-Beauty/c/cos_5/results"},
    {"code": "cos_6", "url": "https://www.costco.co.kr/Home-Kitchen-Patio-Garden/c/cos_6/results"},
    {"code": "cos_7", "url": "https://www.costco.co.kr/Baby-Kids-Toys/c/cos_7/results"},
    {"code": "cos_8", "url": "https://www.costco.co.kr/Sports-Outdoor/c/cos_8/results"},
    {"code": "cos_9", "url": "https://www.costco.co.kr/Clothing-Luggage/c/cos_9/results"},
    {"code": "cos_10", "url": "https://www.costco.co.kr/Office-Products/c/cos_10/results"},
]


def init_firestore():
    if not firebase_admin._apps:
        cred = credentials.Certificate(FIREBASE_CREDENTIALS)
        firebase_admin.initialize_app(cred)
    return firestore.client()


def fetch_prices(context) -> dict:
    """
    Fetch all product prices from API
    Returns: {product_id: {priceKRW, originalPriceKRW, stockStatus}}
    """
    prices = {}
    
    for category in CATEGORIES:
        logger.info(f"💰 Fetching prices: {category['code']}")
        
        for page_num in range(100):
            api_url = f"{category['url']}?q=:relevance&page={page_num}"
            
            try:
                response = context.request.get(api_url, headers={
                    "Accept": "application/json",
                    "Referer": "https://www.costco.co.kr/"
                })
                
                if not response.ok:
                    break
                
                try:
                    data = response.json()
                except:
                    break
                
                products = data.get('results', []) or data.get('products', [])
                if not products:
                    break
                
                for item in products:
                    code = item.get('code', '')
                    if not code:
                        continue
                    
                    price_data = item.get('price', {})
                    base_price_data = item.get('basePrice', {})
                    stock_data = item.get('stock', {})
                    
                    prices[code] = {
                        'priceKRW': price_data.get('value', 0) if price_data else 0,
                        'originalPriceKRW': base_price_data.get('value', 0) if base_price_data else 0,
                        'stockStatus': stock_data.get('stockLevelStatus', 'inStock') if stock_data else 'inStock',
                        'discountMessage': item.get('discountMessage', '')
                    }
                
                time.sleep(0.3)  # Faster than full sync
                
            except Exception as e:
                logger.error(f"  Error: {e}")
                break
    
    return prices


def sync_prices(db, prices: dict) -> dict:
    """
    Update prices in Firebase
    Returns: {updated, new_discounts, discount_ended}
    """
    stats = {'updated': 0, 'new_discounts': 0, 'discount_ended': 0, 'price_changed': 0}
    
    # Get all products
    products_ref = db.collection('products')
    
    batch = db.batch()
    batch_count = 0
    
    for product_id, price_info in prices.items():
        doc_ref = products_ref.document(product_id)
        doc = doc_ref.get()
        
        if not doc.exists:
            continue  # New product - will be handled by full_sync
        
        current = doc.to_dict()
        
        new_price = price_info['priceKRW']
        original_price = price_info['originalPriceKRW'] or new_price
        
        # Calculate discount
        has_discount = original_price > new_price and new_price > 0
        discount_percent = 0
        if has_discount:
            discount_percent = round((1 - new_price / original_price) * 100)
        
        # Check for changes
        update_data = {
            'priceKRW': new_price,
            'originalPriceKRW': original_price,
            'hasDiscount': has_discount,
            'discountPercent': discount_percent,
            'discountMessage': price_info['discountMessage'],
            'stockStatus': price_info['stockStatus'],
            'priceUpdatedAt': firestore.SERVER_TIMESTAMP,
            'lastSeenAt': firestore.SERVER_TIMESTAMP,
        }
        
        # Track discount changes
        was_discounted = current.get('hasDiscount', False)
        
        if has_discount and not was_discounted:
            # New discount started
            update_data['discountStartedAt'] = firestore.SERVER_TIMESTAMP
            stats['new_discounts'] += 1
            logger.info(f"  🏷️ Discount started: {current.get('name', product_id)[:30]} ({discount_percent}% off)")
        
        if not has_discount and was_discounted:
            # Discount ended
            update_data['discountEndedAt'] = firestore.SERVER_TIMESTAMP
            stats['discount_ended'] += 1
            logger.info(f"  📤 Discount ended: {current.get('name', product_id)[:30]}")
        
        # Track price changes
        old_price = current.get('priceKRW', 0)
        if old_price != new_price:
            stats['price_changed'] += 1
        
        batch.update(doc_ref, update_data)
        batch_count += 1
        stats['updated'] += 1
        
        if batch_count >= 400:
            batch.commit()
            batch = db.batch()
            batch_count = 0
    
    if batch_count > 0:
        batch.commit()
    
    return stats


def run_price_sync():
    """
    Run price sync
    """
    start_time = datetime.now()
    logger.info(f"💰 Price Sync Started at {start_time}")
    
    db = init_firestore()
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        )
        
        # Load cookies
        try:
            with open('state.json', 'r') as f:
                context.add_cookies(json.load(f)['cookies'])
        except:
            pass
        
        # Visit home page
        page = context.new_page()
        try:
            page.goto("https://www.costco.co.kr/", wait_until="domcontentloaded", timeout=10000)
            time.sleep(1)
        except:
            pass
        
        # Fetch prices
        prices = fetch_prices(context)
        logger.info(f"📊 Fetched {len(prices)} product prices")
        
        browser.close()
    
    # Sync to Firebase
    stats = sync_prices(db, prices)
    
    end_time = datetime.now()
    duration = (end_time - start_time).total_seconds()
    
    logger.info(f"""
✅ Price Sync completed in {duration:.1f}s
   - Updated: {stats['updated']}
   - Price changed: {stats['price_changed']}
   - New discounts: {stats['new_discounts']}
   - Discounts ended: {stats['discount_ended']}
""")


if __name__ == "__main__":
    run_price_sync()
