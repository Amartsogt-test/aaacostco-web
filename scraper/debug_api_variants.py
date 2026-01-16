import requests

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json"
}

# List of potential endpoints to try
URLS = [
    "https://www.costco.co.kr/rest/v2/korea/products/search",
    "https://www.costco.co.kr/rest/v2/costco/products/search",
    "https://www.costco.co.kr/rest/v2/products/search",
    "https://www.costco.co.kr/rest/v2/korea/products/search?fields=Basic",
]

def test():
    for url in URLS:
        base_url = url.split("?")[0]
        print(f"Testing {base_url}...")
        try:
            # Try with just query
            params = {"query": "637620", "pageSize": 1}
            r = requests.get(base_url, headers=HEADERS, params=params, timeout=5)
            print(f"  Status: {r.status_code}")
            if r.status_code == 200:
                print(f"  ✅ Success! Data: {r.text[:100]}...")
            else:
                print(f"  ❌ Failed.")
        except Exception as e:
            print(f"  ⚠️ Error: {e}")
        print("-" * 20)

if __name__ == "__main__":
    test()
