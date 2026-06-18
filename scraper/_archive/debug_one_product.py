import time
import json
import logging
from playwright.sync_api import sync_playwright
import random

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')
logger = logging.getLogger(__name__)

API_URL = "https://www.costco.co.kr/Electronics/c/cos_1/results?q=:relevance&page=0"

def run_debug():
    logger.info("🐞 STARTING DEBUG: Fetching 1 Product...")
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1920, "height": 1080}
        )
        
        # Load Cookies if valid
        try:
            with open('state.json', 'r') as f:
                data = json.load(f)
                if 'cookies' in data:
                    context.add_cookies(data['cookies'])
                    logger.info("  > Loaded Cookies from state.json")
        except: pass

        page = context.new_page()
        
        # 1. Go Home first to refresh session/pass visible challenges
        logger.info("  > Navigating to Home Page (to pass WAF)...")
        try:
            page.goto("https://www.costco.co.kr/", wait_until="domcontentloaded", timeout=15000)
            time.sleep(3)
        except Exception as e:
            logger.warning(f"  ! Home page load issue: {e}")

        # 2. Go to API URL using browser (Page View)
        logger.info("  > Fetching API Data...")
        try:
            page.goto(API_URL, wait_until="networkidle")
            
            # Browser usually wraps JSON in a PRE tag or just body text
            content = page.inner_text("body")
            
            try:
                data = json.loads(content)
                
                # Extract Products
                products = data.get("results", []) or data.get("products", [])
                
                if products:
                    p = products[0]
                    print("\n" + "="*40)
                    print("✅ SUCCESS! FOUND PRODUCT:")
                    print("="*40)
                    print(f"NAME:  {p.get('name')}")
                    print(f"PRICE: {p.get('price', {}).get('formattedValue')}")
                    print(f"URL:   https://www.costco.co.kr{p.get('url')}")
                    
                    imgs = p.get('images', [])
                    if imgs:
                        print(f"IMAGE: https://www.costco.co.kr{imgs[0].get('url')}")
                    else:
                        print("IMAGE: (No Image)")
                    print("="*40 + "\n")
                else:
                    logger.error("❌ Valid JSON received, but NO products list found.")
                    logger.info(f"Keys: {list(data.keys())}")

            except json.JSONDecodeError:
                logger.error("❌ Failed to parse JSON. Site returned HTML (Blocked).")
                logger.info(f"Preview: {content[:200]}")
                
        except Exception as e:
            logger.error(f"❌ Error fetching API: {e}")
            
        browser.close()

if __name__ == "__main__":
    run_debug()
