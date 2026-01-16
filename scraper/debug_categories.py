
import requests
import json

CODE = "608719" # Hetbahn Rice
URL = f"https://www.costco.co.kr/rest/v2/korea/products/{CODE}?fields=FULL"
HEADERS = {
    "User-Agent": "Mozilla/5.0"
}

try:
    print(f"Fetching {URL}...")
    r = requests.get(URL, headers=HEADERS, timeout=10)
    data = r.json()
    
    # Print Breadcrumbs
    print("\n[Breadcrumbs]")
    print(json.dumps(data.get("breadcrumbs", []), indent=2, ensure_ascii=False))
    
    # Print Classifications (another source for categories)
    print("\n[Classifications]")
    # Just print names/codes to verify
    classifications = data.get("classifications", [])
    for c in classifications:
        print(f"- {c.get('name')} (Code: {c.get('code')})")

    # Check categories field directly if exists
    print("\n[Categories]")
    cats = data.get("categories", [])
    for c in cats:
        try:
            print(f"Name: {c.get('name')}, Code: {c.get('code')}")
        except:
            print(f"Code: {c.get('code')} (Name print failed)")

except Exception as e:
    print(e)
