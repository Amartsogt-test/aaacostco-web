
import requests
import json
import sys

# Force UTF-8 encoding
sys.stdout.reconfigure(encoding='utf-8')

# Use a product that likely has multiple images
# User showed toothbrushes, let's try a known ID or search for one.
# Default to the tissue one (701285) or try to find the toothbrush.
PRODUCT_CODE = "638179" # Example ID (Oral-B Toothbrush often has ID like this or similar)
# Actually, let's search for "Toothbrush" to find a relevant product to inspect
SEARCH_URL = "https://www.costco.co.kr/rest/v2/korea/products/search"
HEADERS = {
    "User-Agent": "Mozilla/5.0"
}

def inspect_images():
    print("Searching for a product with images...")
    
    # 1. Search for a product (e.g. 'toothbrush' or just take first from default search)
    r = requests.get(SEARCH_URL, headers=HEADERS, params={"query": ":relevance", "pageSize": 10})
    data = r.json()
    products = data.get("products", [])
    
    target_product = None
    if products:
        target_product = products[0]
        print(f"Inspecting Product: {target_product.get('name')} (ID: {target_product.get('code')})")
    
    if target_product:
        # Get Full Details
        pdp_url = f"https://www.costco.co.kr/rest/v2/korea/products/{target_product.get('code')}"
        r2 = requests.get(pdp_url, headers=HEADERS, params={"fields": "FULL"})
        full_data = r2.json()
        
        images = full_data.get("images", [])
        print(f"\nTotal Image Entries: {len(images)}")
        
        for i, img in enumerate(images):
            print(f"[{i}] Type: {img.get('imageType')} | Format: {img.get('format')} | GalleryIndex: {img.get('galleryIndex')} | URL: {img.get('url')}")

if __name__ == "__main__":
    inspect_images()
