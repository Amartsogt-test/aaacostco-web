import time
import logging
from playwright.sync_api import sync_playwright

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Try a deeper category: TV (cos_1.1)
API_URL = "https://www.costco.co.kr/Electronics/TV/c/cos_1.1/results?q=:relevance&page=0"

def debug_sub_api():
    logger.info("🐞 TESTING SUB-CATEGORY API (TV)...")
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, slow_mo=1000)
        context = browser.new_context()
        page = context.new_page()
        
        # Go Home
        page.goto("https://www.costco.co.kr/")
        time.sleep(2)
        
        # Go to API
        logger.info(f"  > Visiting {API_URL}")
        page.goto(API_URL, wait_until="commit")
        
        time.sleep(10)
        
        content = page.inner_text("body")
        if "results" in content or "products" in content:
            print("\n✅ SUCCESS: Found JSON in TV Category!\n")
            print(content[:200])
        else:
            print("\n❌ FAILED. Still no JSON.\n")
            print(content[:300])
            
        browser.close()

if __name__ == "__main__":
    debug_sub_api()
