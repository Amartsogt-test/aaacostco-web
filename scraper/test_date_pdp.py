import requests
import re

url = "https://www.costco.co.kr/ElectronicsComputers/AudioVideo/HeadphonesEarphones/Bose-QC-SC-Noise-Cancelling-Wireless-Headphone/p/1785779"
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

r = requests.get(url, headers=headers, timeout=10)
if r.status_code == 200:
    html = r.text
    # Pattern: 2025/12/08 - 2026/01/04
    # Regex: \d{4}/\d{2}/\d{2}\s*-\s*(\d{4}/\d{2}/\d{2})
    
    matches = re.search(r'\d{4}/\d{2}/\d{2}\s*-\s*(\d{4}/\d{2}/\d{2})', html)
    if matches:
        print(f"✅ Found End Date: {matches.group(1)}")
    else:
        print("❌ Date not found.")
        # Print context around 'Period' or 'Event'
        context = re.search(r'.{20}[Pp]eriod.{30}', html)
        if context:
            print(f"Context: {context.group(0)}")
