import sys
import os

# Ensure scraper dir is in path
sys.path.append(os.path.join(os.getcwd(), 'scraper'))

from fast_scraper import get_costco_price_fast

CODE = "511435"

print(f"Testing English Name extraction for {CODE}...")
krw_price, in_stock, url, name, img, end_date, old_price, name_en = get_costco_price_fast(CODE)

print("\n--- RESULTS ---")
print(f"Name (KR): {name}")
print(f"Name (EN): {name_en}")
print(f"Price: {krw_price}")

if name_en and "Luxnine" in name_en:
    print("\n✅ Verification SUCCESS: English Name found!")
else:
    print("\n❌ Verification FAILED: English Name missing or incorrect.")
