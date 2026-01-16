
import requests
import json
import sys

# Force UTF-8 encoding
sys.stdout.reconfigure(encoding='utf-8')

PRODUCT_CODE = "701285" # Kirkland Tissue
API_URL = f"https://www.costco.co.kr/rest/v2/korea/products/{PRODUCT_CODE}"

HEADERS = {
    "User-Agent": "Mozilla/5.0"
}

def check_categories():
    print(f"Fetching product data for {PRODUCT_CODE}...")
    try:
        # Request with FULL fields
        r = requests.get(API_URL, headers=HEADERS, params={"fields": "FULL"}, timeout=10)
        data = r.json()
        
        print("\n--- root keys ---")
        print(list(data.keys()))
        
        print("\n--- categories field ---")
        categories = data.get("categories", [])
        print(json.dumps(categories, indent=2, ensure_ascii=False))
        
        print("\n--- classification field ---")
        classifications = data.get("classifications", [])
        # Just print names of classifications to see if they are categories
        for c in classifications:
            print(f"Name: {c.get('name')}, Code: {c.get('code')}")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_categories()
