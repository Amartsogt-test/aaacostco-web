import json
import time
from playwright.sync_api import sync_playwright

def inspect_product_with_browser():
    url = "https://www.costco.co.kr/rest/v2/korea/products/1397553?fields=FULL&lang=en&curr=KRW"
    print("Launching Browser to fetch data (bypassing WAF)...")
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Use a realistic User Agent
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = context.new_page()
        
        # 1. Go to Home first to set cookies/pass challenges
        try:
            print("Navigating to Home...")
            page.goto("https://www.costco.co.kr/", timeout=30000)
            time.sleep(2)
        except Exception as e:
            print(f"Home nav warning: {e}")

        # 2. Go to API URL
        print(f"Fetching API: {url}")
        response = page.goto(url)
        content = page.inner_text("body")
        
        try:
            data = json.loads(content)
            print("\n✅ Successfully Fetched JSON!")
            
            # --- VERIFY FIELDS ---
            print("-" * 40)
            print(f"Product Code: {data.get('code')}")
            
            # Check price/unit price
            price_obj = data.get('price', {})
            print(f"Price: {price_obj.get('formattedValue')}")
            
            # Logic from costco_bot.py
            unit_price = None
            if "supplementaryPriceLabel" in price_obj:
                unit_price = price_obj["supplementaryPriceLabel"]
            
            if not unit_price:
                up_obj = data.get("unitPrice") or price_obj.get("unitPrice")
                if isinstance(up_obj, dict):
                    unit_price = up_obj.get("formattedValue") or up_obj.get("supplementaryPriceLabel")
            
            if not unit_price:
                potential_promos = data.get("potentialPromotions", [])
                if potential_promos and isinstance(potential_promos[0], dict):
                     unit_price = potential_promos[0].get("supplementaryPriceLabel")

            print(f"Unit Price Found: {unit_price}")
            print("-" * 40)
            
            # Check for specific "490 won" text
            if unit_price and "490" in unit_price:
                print("✅ TEST PASSED: Found '490' in unit price.")
            else:
                print("⚠️ TEST WARNING: '490' not explicitly found in unit price (might be different or None).")

        except json.JSONDecodeError:
            print("❌ Failed to parse JSON. Content might be HTML:")
            print(content[:100])
        
        browser.close()

if __name__ == "__main__":
    inspect_product_with_browser()
