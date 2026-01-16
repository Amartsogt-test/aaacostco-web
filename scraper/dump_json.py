import requests
import json

COSTCO_API_URL = "https://www.costco.co.kr/rest/v2/korea/products/search"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json"
}

def dump(product_code):
    params = {"fields": "FULL", "query": str(product_code), "pageSize": 1}
    r = requests.get(COSTCO_API_URL, headers=HEADERS, params=params, timeout=10)
    if r.status_code == 200:
        data = r.json()
        if "products" in data and len(data["products"]) > 0:
            print(json.dumps(data["products"][0], indent=2, ensure_ascii=False))
        else:
            print("Product not found")
    else:
        print(f"Error {r.status_code}")

if __name__ == "__main__":
    dump(1785779)
