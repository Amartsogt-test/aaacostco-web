import requests
import re

url = "https://www.costco.co.kr/c/SpecialPriceOffers"
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

print(f"Fetching {url}...")
r = requests.get(url, headers=headers)
if r.status_code == 200:
    html = r.text
    print("Success. Searching for potential category codes...")
    # Look for "code":"SpecialPriceOffers" or similar
    # Spartacus often puts context in scripts
    
    # Search for any string that looks like a category ID being used
    # Often it is just SpecialPriceOffers but maybe capitalized differently?
    
    if "SpecialPriceOffers" in html:
        print("Found 'SpecialPriceOffers' in HTML.")
    else:
        print("'SpecialPriceOffers' NOT found in HTML. Redirected?")
    
    # Save to file for manual inspection if needed, but let's try to extract something
    with open("debug_special_offers.html", "w", encoding="utf-8") as f:
        f.write(html)
    print("Saved HTML.")
else:
    print(f"Failed: {r.status_code}")
