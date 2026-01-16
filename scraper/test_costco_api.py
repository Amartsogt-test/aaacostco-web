import requests

COSTCO_API_URL = "https://www.costco.co.kr/rest/v2/korea/products/search"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json"
}

def test_api(product_code):
    print(f"🔎 Testing Costco API for code: {product_code}...")
    try:
        params = {"fields": "FULL", "query": str(product_code), "pageSize": 1}
        response = requests.get(COSTCO_API_URL, headers=HEADERS, params=params, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            if "products" in data and len(data["products"]) > 0:
                item = data["products"][0]
                price = item.get("price", {}).get("value", "N/A")
                url = item.get("url", "N/A")
                print(f"✅ SUCCESS! Found product: {item.get('name')}")
                print(f"   Price: {price} KRW")
                print(f"   URL: https://www.costco.co.kr{url}")
                return True
            else:
                print("❌ API returned 200 but product not found.")
        else:
            print(f"❌ API Error: Status {response.status_code}")
    except Exception as e:
        print(f"❌ Connection Error: {e}")
    return False

if __name__ == "__main__":
    test_api(637620) # Test with a known item (e.g. HEADPHONE)
