"""
Quick script to check all Costco Korea category codes and their product counts
"""
import requests
import time
import json

BASE_URL = "https://www.costco.co.kr/rest/v2/korea/products/search"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json"
}

def check_category(code, query_type="category"):
    """Check if a category exists and how many products it has"""
    params = {
        "fields": "pagination,breadcrumbs",
        "query": f":relevance:{query_type}:{code}",
        "pageSize": "1",
        "currentPage": "0"
    }
    try:
        r = requests.get(BASE_URL, params=params, headers=HEADERS, timeout=15)
        if r.status_code == 200:
            data = r.json()
            pagination = data.get("pagination", {})
            total = pagination.get("totalResults", 0)
            breadcrumbs = data.get("breadcrumbs", [])
            name = ""
            for bc in breadcrumbs:
                if bc.get("facetValueName"):
                    name = bc["facetValueName"]
            return {"code": code, "total": total, "name": name, "status": "OK"}
        else:
            return {"code": code, "total": 0, "name": "", "status": f"HTTP {r.status_code}"}
    except Exception as e:
        return {"code": code, "total": 0, "name": "", "status": f"ERROR: {e}"}

print("=" * 70)
print("COSTCO KOREA CATEGORY CHECK")
print("=" * 70)

# 1. Check cos_1 through cos_20
print("\n--- Standard Categories (cos_1 to cos_20) ---")
for i in range(1, 21):
    code = f"cos_{i}"
    result = check_category(code)
    status_icon = "✅" if result["total"] > 0 else "❌"
    print(f"  {status_icon} {code:10s} | {result['total']:5d} products | {result['name'][:40]:40s} | {result['status']}")
    time.sleep(0.3)

# 2. Check special/promotional categories
print("\n--- Special Categories ---")
special_cats = [
    ("SpecialPriceOffers", "allCategories"),
    ("BuyersPick", "allCategories"),
    ("whatsnew", "allCategories"),
    ("ks_all", "category"),
    ("cos_1.1", "category"),
    ("cos_1.2", "category"),
    ("cos_4.1", "category"),
    ("cos_13", "category"),
    ("cos_13.1", "category"),
]
for code, qtype in special_cats:
    result = check_category(code, qtype)
    status_icon = "✅" if result["total"] > 0 else "❌"
    print(f"  {status_icon} {code:25s} ({qtype:15s}) | {result['total']:5d} products | {result['name'][:30]}")
    time.sleep(0.3)

# 3. Summary
print("\n" + "=" * 70)
print("Check complete!")
