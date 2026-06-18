import sys
import time
import os
from playwright.sync_api import sync_playwright

def run():
    print("Launching fully controllable persistent browser (Strong Anti-Bot)...")
    user_data_dir = os.path.join(os.getcwd(), "browser_data")
    
    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=user_data_dir,
            headless=False,
            channel="chrome", # Actual Chrome
            args=[
                "--disable-blink-features=AutomationControlled",
                "--disable-infobars",
                "--start-maximized"
            ],
            viewport={'width': 1280, 'height': 800},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        
        # Override webdriver and other flags to hide bot detection more thoroughly
        context.add_init_script("""
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined
        });
        Object.defineProperty(navigator, 'languages', {
            get: () => ['en-US', 'en']
        });
        Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3]
        });
        window.chrome = {
            runtime: {}
        };
        """)
        
        page = context.pages[0] if context.pages else context.new_page()
        print("Navigating to Facebook ...")
        page.goto("https://www.facebook.com", timeout=60000)
        
        page2 = context.new_page()
        page2.goto("https://www.costco.co.kr", timeout=60000)

        page3 = context.new_page()
        page3.goto("https://mail.naver.com", timeout=60000)

        page4 = context.new_page()
        page4.goto("https://costco.mn", timeout=60000)
        
        print("Browser opened successfully with 4 tabs.")
        print("This is the main profile browser. Keeping open for 60 minutes...")
        
        time.sleep(3600)
        context.close()

if __name__ == "__main__":
    run()
