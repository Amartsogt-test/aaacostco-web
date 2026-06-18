import requests
import json

# Search for "Braun Series 8"
query = "Braun Series 8"
url = "https://www.costco.co.kr/rest/v2/korea/products/search"
params = {
    "fields": "FULL",
    "query": query,
    "pageSize": 5
}
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

print(f"Searching for '{query}'...")
try:
    r = requests.get(url, params=params, headers=headers, timeout=10)
    if r.status_code == 200:
        data = r.json()
        products = data.get("products", [])
        print(f"Found {len(products)} products.")
        for p in products:
            print(f"Name: {p.get('name')}")
            print(f"Code: {p.get('code')}")
            print(f"Price: {p.get('price', {}).get('value')}")
            print("-" * 20)
    else:
        print(f"Failed with status {r.status_code}")
except Exception as e:
    print(f"Error: {e}")
