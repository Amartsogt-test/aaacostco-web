
import requests
import json
import sys

# Force UTF-8 encoding for Windows console
sys.stdout.reconfigure(encoding='utf-8')

PRODUCT_CODE = "701285" # Kirkland Tissue (Known product)
API_URL = f"https://www.costco.co.kr/rest/v2/korea/products/{PRODUCT_CODE}"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
}

def check_lang(label, params=None, headers=None):
    print(f"\n--- Testing: {label} ---")
    try:
        req_headers = HEADERS.copy()
        if headers:
            req_headers.update(headers)
            
        r = requests.get(API_URL, headers=req_headers, params=params, timeout=10)
        data = r.json()
        
        # Check Name
        name = data.get("name", "N/A")
        print(f"Name: {name}")
        
        # Check Specs (first one)
        classifications = data.get("classifications", [])
        if classifications:
            features = classifications[0].get('features', [])
            if features:
                f = features[0]
                print(f"Spec Name: {f.get('name')}")
                print(f"Spec Value: {f.get('featureValues', [{}])[0].get('value')}")
        else:
            print("No specs found.")
            
    except Exception as e:
        print(f"Error: {e}")

def run_tests():
    # 1. Default (Korean expected)
    check_lang("Default")

    # 2. Query param lang=en
    check_lang("Param lang=en", params={"lang": "en"})

    # 3. Query param lang=en_US
    check_lang("Param lang=en_US", params={"lang": "en_US"})

    # 4. Header Accept-Language
    check_lang("Header Accept-Language: en", headers={"Accept-Language": "en"})

if __name__ == "__main__":
    run_tests()
