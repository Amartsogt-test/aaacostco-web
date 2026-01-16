import requests
import re
import pandas as pd
from woocommerce import API
import time
import random
import os
import sys
# Force UTF-8 encoding for Windows console
sys.stdout.reconfigure(encoding='utf-8')

import firebase_admin
from firebase_admin import credentials, firestore
from bs4 import BeautifulSoup

# ==========================================
# 1. ТОХИРГООНЫ ХЭСЭГ (ЭНИЙГ ӨӨРЧЛӨӨРЭЙ)
# ==========================================

# Таны WordPress сайтын түлхүүрүүд
WC_URL = "https://your-website.com" 
WC_KEY = "ck_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
WC_SECRET = "cs_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"

# Ханш болон Ашиг
EXCHANGE_RATE = 2.5   # 1 Вон = 2.5 Төгрөг
MARGIN_PERCENT = 1.0  # Ашиг нэмэхгүй (1.0 = 0%)

# Excel файлын нэр (Барааны жагсаалт)
DB_FILE = "products_db.xlsx"

# Costco API Тохиргоо (Хайлтын API)
COSTCO_API_URL = "https://www.costco.co.kr/rest/v2/korea/products/search"

# Firebase Credentials Path
# Firebase Credentials Path
# Use relative path or correct absolute path
FIREBASE_CRED_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'functions', 'service-account.json'))


# Толгой мэдээлэл (Робот биш гэж харагдахын тулд)
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json"
}

# ==========================================
# 2. ФУНКЦУУД
# ==========================================

def init_firebase():
    """Initialize Firebase Admin SDK"""
    try:
        if not firebase_admin._apps:
            if os.path.exists(FIREBASE_CRED_PATH):
                cred = credentials.Certificate(FIREBASE_CRED_PATH)
                firebase_admin.initialize_app(cred)
                print("[OK] Firebase initialized successfully.")
                return firestore.client()
            else:
                print(f"[WARN] Firebase credential file not found at {FIREBASE_CRED_PATH}")
                return None
        return firestore.client()
    except Exception as e:
        print(f"[ERR] Firebase init failed: {e}")
        return None

def update_firebase_product(db, product_code, new_price, in_stock, product_url, product_name, product_image, old_price=None, discount_end_date=None, base_price=None, base_old_price=None, product_name_en=None, product_details=None, specifications=None, category=None, sub_category=None, productId=None, unitPrice=None, averageRating=None, reviewCount=None, minOrderQty=None, maxOrderQty=None, images=None, breadcrumbs=None):
    """Update Firestore document with new data"""
    if db is None: return

    try:
        doc_ref = db.collection('products').document(str(product_code))
        
        update_data = {
            "price": new_price,
            "stock": "inStock" if in_stock else "outOfStock",
            "updatedAt": pd.Timestamp.now().isoformat(),
            "createdAt": pd.Timestamp.now().isoformat() # Ensure this field exists for sorting
        }
        
        # Auto-set status to inactive when out of stock
        if not in_stock:
            update_data["status"] = "inactive"
            update_data["inactiveReason"] = "out_of_stock"
        
        if product_url: update_data["costcoUrl"] = product_url
        if product_name: update_data["name"] = product_name
        if product_name_en: update_data["name_en"] = product_name_en
        if product_image: update_data["image"] = product_image
        if product_details: update_data["description"] = product_details
        if specifications: update_data["specifications"] = specifications
        if category: update_data["category"] = category
        if sub_category: update_data["subCategory"] = sub_category
        if productId: update_data["productId"] = productId
        if unitPrice: update_data["unitPrice"] = unitPrice
        
        # New Fields
        if averageRating is not None: update_data["rating"] = float(averageRating)
        if reviewCount is not None: update_data["reviewCount"] = int(reviewCount)
        if minOrderQty: update_data["minOrderQty"] = int(minOrderQty)
        if maxOrderQty: update_data["maxOrderQty"] = int(maxOrderQty)
        if images: update_data["images"] = images

        # Discount Info
        if old_price:
            update_data["oldPrice"] = old_price
        else:
            # If no discount, remove oldPrice if it exists (or set null)
            update_data["oldPrice"] = firestore.DELETE_FIELD

        # Base Prices (KRW) - For client-side calculation
        if base_price:
            update_data["basePrice"] = base_price
            update_data["price"] = base_price # Set price to KRW too as fallback/initial
        
        if base_old_price:
            update_data["baseOldPrice"] = base_old_price
            update_data["oldPrice"] = base_old_price # Set oldPrice to KRW too
        else:
            update_data["baseOldPrice"] = firestore.DELETE_FIELD
            
        if discount_end_date:
            update_data["discountEndDate"] = discount_end_date
        else:
            update_data["discountEndDate"] = firestore.DELETE_FIELD

        # Use set with merge=True to create if not exists, or update if exists
        doc_ref.set(update_data, merge=True)
        print(f"   [OK] Firebase Updated: ID {product_code}")
    except Exception as e:
        print(f"   [ERR] Firebase Update Error: {e}")

def set_product_inactive(db, product_code, reason="not_found"):
    """Set product status to inactive in Firebase when not found on Costco API"""
    if db is None: return
    
    try:
        doc_ref = db.collection('products').document(str(product_code))
        
        # Check if document exists first
        doc = doc_ref.get()
        if not doc.exists:
            print(f"   [INFO] Product {product_code} not in Firebase, skipping inactive.")
            return
        
        update_data = {
            "status": "inactive",
            "inactiveReason": reason,
            "updatedAt": pd.Timestamp.now().isoformat()
        }
        
        doc_ref.set(update_data, merge=True)
        print(f"   [INACTIVE] Product {product_code} marked as inactive ({reason})")
    except Exception as e:
        print(f"   [ERR] Set Inactive Error: {e}")

# Translation Helper
from deep_translator import GoogleTranslator

def translate_text_list(text_list):
    """
    Translates a list of strings to Mongolian using deep-translator (Google).
    Returns the translated list.
    """
    if not text_list:
        return []
    
    max_retries = 3
    for attempt in range(max_retries):
        try:
            # Use batch translation if supported or loop
            # deep-translator's GoogleTranslator supports translate_batch
            translator = GoogleTranslator(source='auto', target='mn')
            # Split into chunks if too large (Google limit ~5000 chars per req)
            # For specs, it's usually small.
            translated = translator.translate_batch(text_list)
            return translated
        except Exception as e:
            print(f"   [WARN] Translation attempt {attempt+1} failed: {e}")
            time.sleep(2 * (attempt + 1)) # Backoff
            
    print("   [ERR] All translation attempts failed.")
    return [] # Return empty on failure to trigger fallback or skip

def get_costco_price_fast(product_code):
    """
    Costco-ийн Product API ашиглан барааны дэлгэрэнгүй мэдээлэл (үнэ, хямдрал) авна.
    Search API-аас илүү найдвартай (basePrice, couponDiscount өгдөг).
    """
    try:
        # PDP API endpoint (Product Detail)
        pdp_url = f"https://www.costco.co.kr/rest/v2/korea/products/{product_code}"
        params = {
            "fields": "FULL"
        }
        
        response = requests.get(pdp_url, headers=HEADERS, params=params, timeout=10)
        
        if response.status_code == 200:
            item = response.json()
            
            # API алдаа буцаасан эсэх
            if "errors" in item:
                print(f"❌ API Error for {product_code}: {item['errors']}")
                return None, None, None, None, None, None, None, None

            # 1. Үнэ авах (Current Selling Price)
            price_data = item.get("price", {})
            price_value = price_data.get("value")
            
            if price_value is None:
                print(f"❌ Price not found for {product_code}")
                return None, None, None, None, None, None, None, None

            krw_price = float(price_value)
            
            # 2. Бараа байгаа эсэх (stock)
            stock_status = item.get("stock", {}).get("stockLevelStatus", "outOfStock")
            is_in_stock = True if stock_status == "inStock" else False
            
            # 3. URL авах
            product_url = item.get("url", "")
            if product_url:
                product_url = "https://www.costco.co.kr" + product_url
            
            # 4. Нэр авах
            product_name_kr = item.get("name", "")
            product_name_en = item.get("englishName", "")
            
            # FORCE ENGLISH NAME (User Request)
            if product_name_en:
                product_name = product_name_en
            else:
                product_name = product_name_kr
            
            # 5. Зураг авах
            product_image = ""
            images = item.get("images", [])
            if images:
                # Try to find 'zoom' format first
                zoom_img = next((img for img in images if img.get("format") == "zoom"), None)
                if zoom_img:
                    product_image = "https://www.costco.co.kr" + zoom_img.get("url", "")
                elif len(images) > 0:
                     product_image = "https://www.costco.co.kr" + images[0].get("url", "")

            # 6. Хямдрал шалгах (Discount Info) - Improved Logic
            old_price = None
            discount_end_date = None
            
            # Strategy A: Check 'couponDiscount' object (Best source for special offers)
            coupon_discount = item.get("couponDiscount")
            if coupon_discount:
                discount_val = coupon_discount.get("discountValue")
                if discount_val:
                    # Discount Value exists (e.g. 80000)
                    # If krw_price is the discounted price (419000), then old price is 419000 + 80000 = 499000
                    old_price = krw_price + float(discount_val)
                
                # End Date
                discount_end_date = coupon_discount.get("discountEndDate") or coupon_discount.get("localDiscountEndDate")
                if discount_end_date:
                    discount_end_date = discount_end_date.split("T")[0]

            # Strategy B: Check 'basePrice' field
            # basePrice usually holds the original price if differ from price
            if not old_price:
                base_price_data = item.get("basePrice")
                if base_price_data:
                    base_val = base_price_data.get("value")
                    # Only use if base_val > krw_price (meaning there is a discount)
                    if base_val and float(base_val) > krw_price:
                        old_price = float(base_val)

            # Strategy C: Check 'potentialPromotions' (Old structure)
            if not old_price and not discount_end_date:
                promotions = item.get("potentialPromotions", [])
                if promotions:
                    promo = promotions[0]
                    if not discount_end_date:
                        date_str = promo.get("endDate")
                        if date_str: discount_end_date = date_str.split("T")[0]
                    
                    if not old_price:
                        val = promo.get("value")
                        if val:
                             old_price = krw_price + float(val)

            # 7. Дэлгэрэнгүй мэдээлэл (Description)
            product_details = item.get("description", "")
            if product_details:
                # Fix relative image URLs
                product_details = product_details.replace('src="/', 'src="https://www.costco.co.kr/')
                product_details = product_details.replace("src='/", "src='https://www.costco.co.kr/")
            
            # 8. Үзүүлэлтүүд (Specifications)
            specifications = []
            classifications = item.get("classifications", [])
            for c in classifications:
                features = c.get('features', [])
                for f in features:
                    name = f.get('name')
                    feature_values = f.get('featureValues', [])
                    if feature_values:
                        value = feature_values[0].get('value')
                        if name and value:
                            specifications.append({"name": name, "value": value})

            # Translate Specifications to Mongolian
            if specifications:
                try:
                    # Flatten to list for batch translation: [name1, value1, name2, value2, ...]
                    texts_to_translate = []
                    for spec in specifications:
                        texts_to_translate.append(spec["name"])
                        texts_to_translate.append(spec["value"])
                    
                    translated_texts = translate_text_list(texts_to_translate)
                    
                    # Reconstruct list
                    if len(translated_texts) == len(texts_to_translate):
                        for i, spec in enumerate(specifications):
                            # index 0, 1 -> spec 0
                            # index 2, 3 -> spec 1
                            # i*2 is name, i*2+1 is value
                            spec["name"] = translated_texts[i*2]
                            spec["value"] = translated_texts[i*2 + 1]
                            
                    print(f"   [TR] Translated {len(specifications)} specs to Mongolian")
                except Exception as e:
                    print(f"   [WARN] Specs translation failed: {e}")

            # 9. Ангилал авах (HTML-ээс)
            category = None
            sub_category = None
            try:
                if 'html' not in locals() and product_url:
                     r = requests.get(product_url, headers=HEADERS, timeout=10)
                     if r.status_code == 200:
                         html = r.text
                
                if 'html' in locals():
                    soup = BeautifulSoup(html, 'html.parser')
                    # Updated Selector based on debug
                    crumbs = soup.select('ol.breadcrumb li')
                    # Fallback
                    if not crumbs:
                         crumbs = soup.select('.breadcrumb .breadcrumb-item')
                    # Standard: Home > Category > SubCategory > Product
                    # We want indexes 1 and 2 usually.
                    
                    found_cats = []
                    for i, c in enumerate(crumbs):
                        txt = c.get_text(strip=True)
                        # Skip Index 0 (Home) and empty
                        if i > 0 and txt:
                            found_cats.append(txt)
                    
                    if found_cats:
                        # Translate Categories
                        translated_cats = translate_text_list(found_cats)
                        
                        if len(translated_cats) > 0:
                            category = translated_cats[0]
                        if len(translated_cats) > 1:
                            sub_category = translated_cats[1]
                        
                    if found_cats:
                        # Translate Categories
                        translated_cats = translate_text_list(found_cats)
                        
                        if len(translated_cats) > 0:
                            category = translated_cats[0]
                        if len(translated_cats) > 1:
                            sub_category = translated_cats[1]
                        
                        try:
                            print(f"   [CAT] Found: {category} > {sub_category}")
                        except:
                            print("   [CAT] Found category (encoding error in log)")
            except Exception as e:
                print(f"   [WARN] Category scrape failed: {e}")

            # 10. Product ID & Unit Price
            breadcrumbs = translated_cats if 'translated_cats' in locals() else []
            productId = item.get("code")
            
            # Unit Price Extraction Logic
            price_obj = item.get("price", {})
            unitPrice = None
            
            if "supplementaryPriceLabel" in price_obj:
                unitPrice = price_obj["supplementaryPriceLabel"]
            
            if not unitPrice:
                up_obj = item.get("unitPrice") or price_obj.get("unitPrice")
                if isinstance(up_obj, dict):
                    unitPrice = up_obj.get("formattedValue") or up_obj.get("supplementaryPriceLabel")
                elif isinstance(up_obj, str):
                    unitPrice = up_obj
            
            if not unitPrice:
                potential_promos = item.get("potentialPromotions", [])
                if potential_promos and isinstance(potential_promos[0], dict):
                     unitPrice = potential_promos[0].get("supplementaryPriceLabel")

            # 11. New Fields Extraction
            averageRating = item.get("averageRating")
            numberOfReviews = item.get("numberOfReviews")
            minOrderQuantity = item.get("minOrderQuantity")
            maxOrderQuantity = item.get("maxOrderQuantity")
            
            # Process Images for Gallery
            # Deduplicate by galleryIndex, prioritizing 'zoom' > 'product' > 'thumbnail'
            all_images = []
            if images:
                image_map = {} # { galleryIndex: { 'zoom': url, 'product': url ... } }
                
                for img in images:
                    fmt = img.get("format")
                    idx = img.get("galleryIndex", 0) # Default to 0 if missing
                    url = img.get("url")
                    
                    if url and fmt in ["zoom", "product", "thumbnail"]:
                        if idx not in image_map:
                            image_map[idx] = {}
                        image_map[idx][fmt] = url
                
                # Sort by index
                sorted_indices = sorted(image_map.keys())
                
                for idx in sorted_indices:
                    formats = image_map[idx]
                    # Priority: zoom > product > thumbnail
                    final_url = formats.get("zoom") or formats.get("product") or formats.get("thumbnail")
                    
                    if final_url:
                         # Resolve absolute URL
                         full_url = "https://www.costco.co.kr" + final_url
                         if full_url not in all_images:
                             all_images.append(full_url)
            
            return krw_price, is_in_stock, product_url, product_name, product_image, discount_end_date, old_price, product_name_en, product_details, specifications, category, sub_category, productId, unitPrice, averageRating, numberOfReviews, minOrderQuantity, maxOrderQuantity, all_images, breadcrumbs
            
        else:
            print(f"❌ Бараа олдсонгүй (Status: {response.status_code}, Code: {product_code})")
            return None, None, None, None, None, None, None, None
            
    except Exception as e:
        print(f"⚠️ Холболтын алдаа ({product_code}): {e}")
        return None, None, None, None, None, None, None, None, None, None, None, None, None, None

def update_woocommerce_price(wc_api, woo_id, new_price, in_stock, product_url):
    """
    Таны WordPress сайт руу үнэ шинэчлэх хүсэлт илгээнэ.
    """
    if "your-website.com" in WC_URL:
        print(f"   ⚠️ WooCommerce тохиргоо хийгдээгүй байна. (ID: {woo_id}, New Price: {new_price})")
        return

    try:
        data = {
            "regular_price": str(new_price),
            "stock_status": "instock" if in_stock else "outofstock"
        }
        
        # URL хадгалах (Meta data)
        if product_url:
            data["meta_data"] = [
                {
                    "key": "_costco_url",
                    "value": product_url
                }
            ]
        
        # WooCommerce API дуудах
        wc_api.put(f"products/{woo_id}", data)
        status_text = "✅ Идэвхтэй" if in_stock else "⛔ Дууссан"
        print(f"   -> Шинэчиллээ: ID {woo_id} | Үнэ: {new_price}₮ | {status_text}")
        
    except Exception as e:
        print(f"   -> Шинэчилж чадсангүй ID {woo_id}: {e}")

# ==========================================
# 3. ҮНДСЭН ПРОГРАМ
# ==========================================

def run_sync_bot():
    print("🔄 BOT: Үнэ шинэчлэлт эхэллээ...")
    
    # 0. Firebase Init
    db = init_firebase()

    # 1. WooCommerce-тэй холбогдох
    wcapi = API(
        url=WC_URL,
        consumer_key=WC_KEY,
        consumer_secret=WC_SECRET,
        version="wc/v3",
        timeout=30
    )
    
    # 2. Excel файлаас барааны жагсаалтыг унших
    if not os.path.exists(DB_FILE):
        print(f"❌ '{DB_FILE}' файл олдсонгүй! Эхлээд энэ файлыг үүсгэнэ үү.")
        print("   Багана: WooID, CostcoCode")
        return

    try:
        df = pd.read_excel(DB_FILE)
        # Excel баганын нэрс зөв эсэхийг шалгаарай (WooID, CostcoCode)
        print(f"📂 Нийт {len(df)} барааг жагсаалтаас уншлаа.")
    except Exception as e:
        print(f"❌ Excel файлыг уншиж чадсангүй: {e}")
        return

    # 3. Бараа тус бүрээр гүйх
    for index, row in df.iterrows():
        woo_id = row['WooID']
        costco_code = row['CostcoCode']
        
        print(f"\n[{index+1}/{len(df)}] Шалгаж байна: Costco Code {costco_code}...")
        
        # A. Costco-оос хурдан аргаар үнэ авах
        krw_price, in_stock, product_url, product_name, product_image, discount_end_date, old_krw_price, product_name_en, product_details, specifications, category, sub_category, productId, unitPrice, averageRating, numberOfReviews, minOrderQuantity, maxOrderQuantity, all_images = get_costco_price_fast(costco_code)
        
        # Fallback: If API missed discount but we suspect one (or just to be safe for this targeted item),
        # try to scrape HTML if we have URL and no old price yet.
        if krw_price and not old_krw_price and product_url:
            print(f"   🔎 API-д хямдрал олдсонгүй, HTML ухаж байна...")
            try:
                # Use same headers
                r = requests.get(product_url, headers=HEADERS, timeout=10)
                if r.status_code == 200:
                    html = r.text
                    # Look for 299,900 style number inside price-original
                    # Regex for "number + 원"
                    # Pattern: <span class="price-original"> ... 299,900 ... </span>
                    # Simplest regex: look for any money pattern > current price
                    
                    # specific search for known pattern in Costco KR
                    # usually: <div class="price-original"> <span> 299,900원 </span> </div>
                    
                    # Extract all matches of "X,XXX,XXX원"
                    matches = re.findall(r'([\d,]+)원', html)
                    potential_old_prices = []
                    for m in matches:
                        try:
                            val = float(m.replace(",", ""))
                            if val > krw_price: # It must be higher than current price
                                potential_old_prices.append(val)
                        except:
                            pass
                    
                    if potential_old_prices:
                        # Take the max or first reasonable one? 
                        # Usually the first one appearing is the main priceblock
                        old_krw_price = max(potential_old_prices) # Assume highest crossed out price is the MSRP/Old price
                print(f"[OK] HTML found old price: {old_krw_price}")
            except Exception as e:
                pass # Silently fail logs

        if not discount_end_date and product_url:
             try:
                if 'html' not in locals():
                     r = requests.get(product_url, headers=HEADERS, timeout=10)
                     if r.status_code == 200:
                         html = r.text
                
                if 'html' in locals():
                    date_match = re.search(r'"priceValidUntil"\s*:\s*"(\d{4}-\d{2}-\d{2})"', html)
                    if date_match:
                        discount_end_date = date_match.group(1)
                        print(f"[OK] HTML found date: {discount_end_date}")
             except Exception as e:
                 pass

        if krw_price is not None:
            # B. Монгол үнэ тооцох
            mnt_price = int(krw_price * EXCHANGE_RATE * MARGIN_PERCENT)
            
            mnt_old_price = None
            if old_krw_price:
                 mnt_old_price = int(old_krw_price * EXCHANGE_RATE * MARGIN_PERCENT)
            
            # C. WordPress рүү илгээх
            update_woocommerce_price(wcapi, woo_id, mnt_price, in_stock, product_url)
            
            # D. Firebase рүү илгээх (WON үнийг л явуулна)
            # update_firebase_product нь одоо basePrice, baseOldPrice авдаг болсон
            update_firebase_product(
                db, 
                costco_code, 
                krw_price, # Set price as KRW
                in_stock, 
                product_url, 
                product_name, 
                product_image, 
                old_price=old_krw_price, # Set oldPrice as KRW
                discount_end_date=discount_end_date,
                base_price=krw_price,      # New: Base Price (KRW)
                base_old_price=old_krw_price, # New: Base Old Price (KRW)
                product_name_en=product_name_en, # New: English Name
                product_details=product_details, # New: Details
                specifications=specifications, # New: Specs
                category=category,
                sub_category=sub_category,
                productId=productId,
                unitPrice=unitPrice,
                averageRating=averageRating,
                reviewCount=numberOfReviews,
                minOrderQty=minOrderQuantity,
                maxOrderQty=maxOrderQuantity,
                images=all_images
            )

            
            # Серверт ачаалал өгөхгүйн тулд бага зэрэг хүлээнэ
            time.sleep(0.5) 
        else:
            # Бараа Costco API-д олдоогүй тул inactive болгоно
            print(f"   -> Costco API-д олдохгүй байна, INACTIVE болгож байна...")
            set_product_inactive(db, costco_code, reason="not_found_on_costco")

    print("\n✅ БҮХ ҮЙЛДЭЛ ДУУСЛАА!")

if __name__ == "__main__":
    run_sync_bot()
