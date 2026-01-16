
import requests
from bs4 import BeautifulSoup
import sys

# Force UTF-8 encoding
sys.stdout.reconfigure(encoding='utf-8')

URL = "https://www.costco.co.kr/p/701285"
HEADERS = {"User-Agent": "Mozilla/5.0"}

def debug_html():
    r = requests.get(URL, headers=HEADERS)
    print(f"Status: {r.status_code}")
    if r.status_code == 200:
        soup = BeautifulSoup(r.text, 'html.parser')
        
        # Try Selector 1
        s1 = soup.select('.breadcrumb .breadcrumb-item a')
        print(f"Selector 1 (.breadcrumb .breadcrumb-item a): {len(s1)} items")
        for i, el in enumerate(s1):
            print(f"  [{i}] {el.get_text(strip=True)}")
            
        # Try Selector 2 (Old/Alternative)
        s2 = soup.select('ul.breadcrumbs li')
        print(f"Selector 2 (ul.breadcrumbs li): {len(s2)} items")
        
        # Try Selector 3 (Generic)
        s3 = soup.select('ol.breadcrumb li')
        print(f"Selector 3 (ol.breadcrumb li): {len(s3)} items")
        
        # Dump if none found
        if not s1 and not s2 and not s3:
            print("No breadcrumbs found. Dumping part of header...")
            print(str(soup.find('header'))[:500])

if __name__ == "__main__":
    debug_html()
