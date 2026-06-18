
import requests
from bs4 import BeautifulSoup

URL = "https://www.costco.co.kr/p/701285"
HEADERS = {"User-Agent": "Mozilla/5.0"}

try:
    r = requests.get(URL, headers=HEADERS, timeout=10)
    print(f"Status: {r.status_code}")
    soup = BeautifulSoup(r.text, 'html.parser')
    
    # Try common breadcrumb selectors
    breadcrumbs = soup.find_all(class_='breadcrumb')
    if not breadcrumbs:
        breadcrumbs = soup.select('ul li a')
    
    print("\n--- Breadcrumbs Found ---")
    for b in breadcrumbs:
        print(b.text.strip())
        
except Exception as e:
    print(e)
