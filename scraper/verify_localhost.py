import time
from playwright.sync_api import sync_playwright
import os

def verify_localhost():
    print("Starting verification on http://localhost:5173/...")
    with sync_playwright() as p:
        # Launch headful so user can see it "like this"
        browser = p.chromium.launch(headless=False, slow_mo=1000)
        page = browser.new_page()
        
        try:
            page.goto("http://localhost:5173/", timeout=30000)
            print("Page loaded. Waiting for 3 seconds...")
            time.sleep(3)
            
            # Take screenshot
            screenshot_path = os.path.join(os.getcwd(), "localhost_verification.png")
            page.screenshot(path=screenshot_path)
            print(f"Screenshot saved to {screenshot_path}")
            
            # Extract title and simple DOM info to verify "Getting DOM" intent
            title = page.title()
            print(f"Page Title: {title}")
            
            # Maybe they want to see the DOM content?
            # content = page.content()
            # print("DOM Content length:", len(content))
            
            print("Verification complete. Keeping browser open for a few more seconds...")
            time.sleep(5)
            
        except Exception as e:
            print(f"Error visiting localhost: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_localhost()
