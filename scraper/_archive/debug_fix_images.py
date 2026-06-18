import requests
import re

PRODUCT_CODE = "511435"
URL = f"https://www.costco.co.kr/rest/v2/korea/products/{PRODUCT_CODE}?fields=FULL"
HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/json"
}

def check_images():
    print(f"Fetching {PRODUCT_CODE}...")
    resp = requests.get(URL, headers=HEADERS)
    data = resp.json()
    
    desc = data.get("description", "")
    print(f"\nOriginal Description Length: {len(desc)}")
    
    # Check for image tags
    img_tags = re.findall(r'<img[^>]+src="([^">]+)"', desc)
    print(f"Found {len(img_tags)} images.")
    
    for src in img_tags[:3]:
        print(f"   Image Src: {src}")

    # Test Fix
    fixed_desc = desc.replace('src="/', 'src="https://www.costco.co.kr/')
    fixed_desc = fixed_desc.replace("src='/", "src='https://www.costco.co.kr/")
    
    print("\n--- After Fix ---")
    fixed_imgs = re.findall(r'<img[^>]+src="([^">]+)"', fixed_desc)
    for src in fixed_imgs[:3]:
        print(f"   Fixed Src: {src}")

if __name__ == "__main__":
    check_images()
