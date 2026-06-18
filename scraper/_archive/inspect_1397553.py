import requests
import json

def inspect_product():
    url = "https://www.costco.co.kr/rest/v2/korea/products/1397553?fields=FULL"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json"
    }
    
    print(f"Fetching {url}...")
    try:
        r = requests.get(url, headers=headers, timeout=10)
        if r.status_code == 200:
            data = r.json()
            print("Successfully fetched JSON.")
            
            # Recursive search for '490'
            def find_key(obj, target, path=""):
                if isinstance(obj, dict):
                    for k, v in obj.items():
                        find_key(v, target, f"{path}.{k}")
                elif isinstance(obj, list):
                    for i, v in enumerate(obj):
                        find_key(v, target, f"{path}[{i}]")
                elif isinstance(obj, str):
                    if target in obj:
                        print(f"FOUND MATCH at {path}: {obj}")
            
            print("\nSearching for '490'...")
            find_key(data, "490")
            print("\nSearching for 'sheet'...")
            find_key(data, "sheet")
            
            # Print price object
            if 'price' in data:
                print("\nPrice Object:")
                print(json.dumps(data['price'], indent=2, ensure_ascii=False))
                
        else:
            print(f"Failed: {r.status_code}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    inspect_product()
