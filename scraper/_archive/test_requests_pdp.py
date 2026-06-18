import requests
import re

url = "https://www.costco.co.kr/ElectronicsComputers/AudioVideo/HeadphonesEarphones/Bose-QC-SC-Noise-Cancelling-Wireless-Headphone/p/1785779"
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

r = requests.get(url, headers=headers, timeout=10)
print(f"Status: {r.status_code}")
if r.status_code == 200:
    html = r.text
    # Check for price patterns
    print("Searching for prices...")
    matches = re.findall(r'[\d,]+원', html)
    print(f"Found {len(matches)} price-like strings.")
    for m in matches[:5]:
        print(m)
        
    # Check for specific classes
    if "price-original" in html:
        print("Found 'price-original' class.")
    if "you-save-value" in html:
        print("Found 'you-save-value' class.")
        
    # Try to extract the specific old price 299,900
    if "299,900" in html:
        print("Found '299,900' in HTML.")
    else:
        print("Did NOT find '299,900' in HTML.")
