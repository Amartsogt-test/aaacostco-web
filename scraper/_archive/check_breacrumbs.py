
import requests
import sys

# Force UTF-8 encoding
sys.stdout.reconfigure(encoding='utf-8')

PRODUCT_CODE = "701285"
API_URL = f"https://www.costco.co.kr/rest/v2/korea/products/{PRODUCT_CODE}"

def check_breadcrumbs():
    r = requests.get(API_URL, params={"fields": "FULL"})
    data = r.json()
    print(f"Has 'breadcrumbs' key: {'breadcrumbs' in data}")
    if 'breadcrumbs' in data:
        print(data['breadcrumbs'])

if __name__ == "__main__":
    check_breadcrumbs()
