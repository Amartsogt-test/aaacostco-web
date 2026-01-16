import time
import logging
from playwright.sync_api import sync_playwright

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# The API URL we need
API_URL = "https://www.costco.co.kr/Electronics/c/cos_1/results?q=:relevance&page=0"

def debug_api():
    logger.info("🐞 OPENING API URL IN HEADFUL BROWSER...")
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, slow_mo=1000)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 720}
        )
        
        page = context.new_page()
        
        # 1. Go Home first to set cookies/pass challenges
        logger.info("  > Visiting Home Page first...")
        try:
            page.goto("https://www.costco.co.kr/", wait_until="domcontentloaded", timeout=15000)
        except: pass
        
        time.sleep(2)
        
        # 2. Go to API URL
        logger.info(f"  > Going to API URL: {API_URL}")
        page.goto(API_URL, wait_until="commit") # Don't wait for load as JSON doesn't "load" like HTML
        
        logger.info("  > Waiting 15 seconds for you to inspect...")
        time.sleep(15) 
        
        # Try to capture text
        try:
            content = page.inner_text("body")
            if "results" in content or "products" in content:
                print("\n✅ SUCCESS: JSON CONTENT DETECTED!\n")
                print(content[:200])
            else:
                print("\n❌ WARNING: Page content does not look like product JSON.\n")
                print(content[:200])
        except:
            print("❌ Could not read content.")
            
        browser.close()

if __name__ == "__main__":
    debug_api()
