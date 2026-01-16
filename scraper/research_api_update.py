
import requests
import json
import sys

# Force UTF-8 encoding for Windows console
sys.stdout.reconfigure(encoding='utf-8')

SEARCH_API_URL = "https://www.costco.co.kr/rest/v2/korea/products/search"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
}

def analyze_api():
    print("[INFO] Querying Costco API...")
    
    # query with default to see available sorts and fields
    params = {
        "fields": "FULL",
        "query": ":relevance",
        "pageSize": 5,
        "currentPage": 0
    }
    
    try:
        r = requests.get(SEARCH_API_URL, headers=HEADERS, params=params, timeout=15)
        r.raise_for_status()
        data = r.json()
        
        # 1. Check available Sorts
        print("\n[1] Available Sorts:")
        sorts = data.get("sorts", [])
        for s in sorts:
            print(f"   - Code: {s.get('code')} | Name: {s.get('name')} | Selected: {s.get('selected')}")

        # 2. Inspect All Product Fields
        print("\n[2] All Available Product Fields (Sample):")
        products = data.get("products", [])
        if products:
            p = products[0]
            sorted_keys = sorted(p.keys())
            for key in sorted_keys:
                raw_val = p[key]
                # Format value for display
                val_str = str(raw_val)
                if len(val_str) > 100:
                    val_str = val_str[:100] + "..."
                print(f"   - {key}: {val_str}")
        else:
            print("   No products found.")
            
        # 3. Test 'newest' sort if available (common in Hybris)
        # Often codes are 'creationtime' or 'newest'
        
    except Exception as e:
        print(f"[ERR] Request failed: {e}")

if __name__ == "__main__":
    analyze_api()
