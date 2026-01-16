from playwright.sync_api import sync_playwright
import time
import json
import os

# ID of a product that failed
PRODUCT_ID = "635295" 
URL = f"https://www.costco.co.kr/p/{PRODUCT_ID}"

def debug():
    with sync_playwright() as p:
        print("Launching Headed Browser...")
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(
            viewport={'width': 1280, 'height': 800},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )
        
        # Load state
        if os.path.exists("state.json"):
            with open("state.json", 'r') as f:
                context.add_cookies(json.load(f)['cookies'])
            print("✅ Loaded state.json")
        else:
            print("⚠️ state.json not found!")

        page = context.new_page()
        print(f"Navigating to {URL}...")
        page.goto(URL)
        
        print("Waiting for load...")
        page.wait_for_load_state("domcontentloaded")
        time.sleep(5)
        
        # Check selector
        price_el = page.query_selector(".product-price-amount") or page.query_selector(".price-value")
        if price_el:
            print(f"✅ Price Found: {price_el.inner_text()}")
        else:
            print("❌ Price Element NOT Found!")
            
            # Check for Member Only text
            body_text = page.inner_text("body")
            if "Sign In" in body_text or "Member Only" in body_text or "로그인" in body_text:
                print("⚠️ Page says 'Sign In' or 'Member Only' - Login might be invalid.")
            else:
                print("⚠️ Unknown state.")

        print("\nBrowser will stay open for 30 seconds for you to inspect...")
        time.sleep(30)
        browser.close()

if __name__ == "__main__":
    debug()
