import requests
import json
import re

# Costco API URL
# Using a product code from the previous context (e.g. 511435 - Luxnine Topper)
PRODUCT_CODE = "511435" 
URL = f"https://www.costco.co.kr/rest/v2/korea/products/{PRODUCT_CODE}?fields=FULL"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json"
}

def inspect_product():
    print(f"Fetching data for {PRODUCT_CODE}...")
    resp = requests.get(URL, headers=HEADERS, timeout=10)
    
    if resp.status_code != 200:
        print(f"Error: {resp.status_code}")
        return

    data = resp.json()
    
    # Dump keys to see what we have
    print("Top level keys:", data.keys())
    
    # Check for Description (Product Details)
    print("\n--- DESCRIPTION (Product Details) ---")
    desc = data.get("description", "N/A")
    print(desc[:500] + "..." if len(desc) > 500 else desc)

    # Check for Classifications / Specs
    print("\n--- CLASSIFICATIONS (Potential Specs) ---")
    classifications = data.get("classifications", [])
    for c in classifications:
        print(f"Type: {c.get('code')}")
        features = c.get('features', [])
        for f in features:
            print(f"  - {f.get('name')}: {f.get('featureValues', [{}])[0].get('value')}")

    # Check for other potential fields
    print("\n--- OTHER POTENTIAL FIELDS ---")
    print("summary:", data.get("summary", "")[:100])
    print("name:", data.get("name"))
    print("englishName:", data.get("englishName"))

if __name__ == "__main__":
    inspect_product()
