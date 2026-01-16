import requests
import json

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json"
}

def check_product(code):
    url = f"https://www.costco.co.kr/rest/v2/korea/products/{code}?fields=FULL"
    print(f"Fetching {url}...")
    try:
        r = requests.get(url, headers=HEADERS, timeout=10)
        if r.status_code == 200:
            data = r.json()
            # print(json.dumps(data, indent=2, ensure_ascii=False))
            
            # Check for strings
            s_data = json.dumps(data)
            if "490" in s_data:
                print("FOUND '490' in JSON!")
            else:
                print("'490' NOT FOUND in JSON.")
                
            if "sheet" in s_data:
                print("FOUND 'sheet' in JSON!")

            # specific fields check
            print("\nSpecific Fields:")
            print("Code:", data.get("code"))
            print("Price:", data.get("price"))
            print("Unit Price Info:", data.get("price", {}).get("unitPrice"))
            print("Base Price Info:", data.get("basePrice"))
            
        else:
            print(f"Error: {r.status_code}")
    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    check_product("1397553")
