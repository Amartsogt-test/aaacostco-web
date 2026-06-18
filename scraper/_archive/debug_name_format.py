import requests
import json

COSTCO_API_URL = "https://www.costco.co.kr/rest/v2/korea/products/search"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json"
}

def check_names(query="TV"):
    params = {
        "fields": "FULL",
        "query": query,
        "pageSize": 5
    }
    
    response = requests.get(COSTCO_API_URL, headers=HEADERS, params=params, timeout=10)
    if response.status_code == 200:
        data = response.json()
        if "products" in data:
            for item in data["products"]:
                print(f"Name: {item.get('name')}")
        else:
            print("No products found")
    else:
        print(f"Error: {response.status_code}")

if __name__ == "__main__":
    check_names()
