import requests
import re

# Costco Korea Special Offers Page
url = "https://www.costco.co.kr/Offers/c/Cos_Offers"
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

print(f"Fetching {url}...")
try:
    r = requests.get(url, headers=headers, timeout=10)
    if r.status_code == 200:
        html = r.text
        # Find products with a "price-original" or similar indication of discount in the list view
        # The list view usually has links like /p/123456
        
        # We can look for patterns where there is a strike-through price near a product link
        # Or just grab all product links and check them one by one? No, too slow.
        
        # Let's just find all product IDs on this "Offers" page. Any item here should be an offer.
        # href="/p/123456"
        
        product_ids = re.findall(r'/p/(\d+)', html)
        unique_ids = list(set(product_ids))
        
        print(f"Found {len(unique_ids)} products on the Offers page.")
        
        # Let's verify one by one if they actually have a discount (optional, but good)
        # Or just pick the first one.
        if unique_ids:
            print(f"Top 5 IDs: {unique_ids[:5]}")
            
            # Let's save the first one to use
            print(f"Selected Product ID: {unique_ids[0]}")
            with open("found_product_id.txt", "w") as f:
                f.write(unique_ids[0])
        else:
            print("No products found on Offers page. Attempting another category.")
            
    else:
        print(f"Failed with status {r.status_code}")

except Exception as e:
    print(f"Error: {e}")
