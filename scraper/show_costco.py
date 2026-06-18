import time
import os
from playwright.sync_api import sync_playwright

def run():
    print("Launching controllable persistent visible browser with multiple tabs...")
    user_data_dir = os.path.join(os.getcwd(), "browser_data")
    
    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=user_data_dir,
            headless=False,
            channel="chrome",
            args=["--disable-blink-features=AutomationControlled"],
            viewport={'width': 1280, 'height': 800}
        )
        
        context.add_init_script("""
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined
        })
        """)
        
        # Open costco.mn
        page1 = context.pages[0] if context.pages else context.new_page()
        print("Navigating to https://costco.mn ...")
        page1.goto("https://costco.mn", timeout=60000)
        
        # Open costco.co.kr
        page2 = context.new_page()
        print("Navigating to https://costco.co.kr ...")
        page2.goto("https://www.costco.co.kr/", timeout=60000)
        
        # Open mail.naver.com
        page3 = context.new_page()
        print("Navigating to https://mail.naver.com ...")
        page3.goto("https://mail.naver.com", timeout=60000)
        
        print("Browser is open with all required tabs.")
        print("Waiting 60 minutes...")
        
        time.sleep(3600)
        
        context.close()

if __name__ == "__main__":
    run()
