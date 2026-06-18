import time
import logging
from playwright.sync_api import sync_playwright

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

URL = "https://www.costco.co.kr/AudioVideo/HeadphonesEarphones/Bose-QC-SC-Noise-Cancelling-Wireless-Headphone/p/1785779"

def debug():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, slow_mo=1000)
        page = browser.new_page()
        
        logger.info(f"Visiting {URL}")
        page.goto(URL, timeout=60000, wait_until="domcontentloaded")
        time.sleep(5)
        
        page.screenshot(path="debug_final_pdp.png")
        logger.info("Screenshot saved.")
        
        # Dump HTML
        with open("debug_final_pdp.html", "w", encoding="utf-8") as f:
            f.write(page.content())
            
        browser.close()

if __name__ == "__main__":
    debug()
