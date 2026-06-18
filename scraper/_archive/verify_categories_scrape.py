
from fast_scraper import get_costco_price_fast
import sys

# Force UTF-8 encoding
sys.stdout.reconfigure(encoding='utf-8')

PRODUCT_CODE = "701285" # Kirkland Tissue

def test_scrape():
    print(f"Testing scrape for {PRODUCT_CODE}...")
    res = get_costco_price_fast(PRODUCT_CODE)
    
    # Unpack 20 values
    (krw_price, in_stock, product_url, product_name, product_image, 
     discount_end_date, old_krw_price, product_name_en, product_details, 
     specifications, category, sub_category, productId, unitPrice,
     averageRating, numberOfReviews, minOrderQuantity, maxOrderQuantity, all_images, breadcrumbs) = res
     
    print(f"\n--- Result ---")
    print(f"Category: {category}")
    print(f"SubCategory: {sub_category}")
    print(f"Breadcrumbs: {breadcrumbs}")

if __name__ == "__main__":
    test_scrape()
