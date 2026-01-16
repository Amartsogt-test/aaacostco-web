import requests
import re

url = "https://www.costco.co.kr/ElectronicsComputers/AudioVideo/HeadphonesEarphones/Bose-QC-SC-Noise-Cancelling-Wireless-Headphone/p/1785779"
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

print(f"Fetching {url}...")
try:
    r = requests.get(url, headers=headers, timeout=10)
    if r.status_code == 200:
        html = r.text
        with open("found_dates.txt", "w", encoding="utf-8") as f:
            f.write(f"HTML Length: {len(html)}\n")
            
            # Search for the year 2026 which is likely in the end date
            keywords = ["2026", "2025", "Period", "Event", "promotion"]
            
            found = False
            for k in keywords:
                indices = [m.start() for m in re.finditer(k, html)]
                if indices:
                    found = True
                    f.write(f"\n--- Found '{k}' at {len(indices)} locations ---\n")
                    for i in indices: # Save ALL matches
                        start = max(0, i - 100)
                        end = min(len(html), i + 200)
                        chunk = html[start:end].replace("\n", " ")
                        f.write(f"Context: {chunk}\n")
                        
            if not found:
                f.write("❌ Keywords not found in static HTML. Content might be dynamic.")
        print("Done writing to found_dates.txt")
            
    else:
        print(f"Failed with status {r.status_code}")

except Exception as e:
    print(f"Error: {e}")
