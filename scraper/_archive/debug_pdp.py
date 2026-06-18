import time
import logging
from playwright.sync_api import sync_playwright

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

CAT_URL = "https://www.costco.co.kr/Electronics/c/cos_1"

def debug_pdp():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, slow_mo=1000)
        page = browser.new_page()
        
        logger.info(f"Navigating to {CAT_URL}")
        page.goto(CAT_URL)
        time.sleep(5)
        
        # Helper to find product link
        product_url = None
        
        # Try to find any link with /p/ which is standard for products
        logger.info("Scanning for product links (/p/)...")
        links = page.query_selector_all("a[href*='/p/']")
        if links:
             product_url = "https://www.costco.co.kr" + links[0].get_attribute("href")
             logger.info(f"Found product link on homepage: {product_url}")
        else:
            # Try clicking subcats to find one
            logger.info("No product links on root. Diving into subcategories...")
            cats = page.query_selector_all(".category-node a")
            for i in range(min(3, len(cats))):
                try:
                    cats[i].click()
                    time.sleep(3)
                    links = page.query_selector_all("a[href*='/p/']")
                    if links:
                        product_url = "https://www.costco.co.kr" + links[0].get_attribute("href")
                        logger.info(f"Found product link in subcat: {product_url}")
                        break
                    page.go_back()
                    time.sleep(2)
                    cats = page.query_selector_all(".category-node a") # Re-query
                except: pass

        if product_url:
            logger.info(f"Navigating to PDP: {product_url}")
            page.goto(product_url)
            page.wait_for_load_state("domcontentloaded")
            time.sleep(5)
            
            # Now on PDP. Inspect options.
            logger.info("Inspecting PDP...")
            
            # Check for generic option containers
            html = page.evaluate("""() => {
                const selectors = [
                    '.variant-selector', 
                    '.variant-list', 
                    '.style-selector', 
                    '.attributes', 
                    'cx-variant-style-icons',
                    '.variant-detail',
                    'ul.variant-list'
                ];
                let report = "";
                for(let s of selectors) {
                    const els = document.querySelectorAll(s);
                    if(els.length > 0) {
                        report += `Found ${s}: ${els.length} items\\n`;
                        report += els[0].outerHTML.substring(0, 1000) + "\\n\\n";
                    }
                }
                return report;
            }""")
            
            print("\n--- OPTION SELECTORS FOUND ---\n")
            print(html)
            
            # Check for images
            img_count = page.evaluate("document.querySelectorAll('.gallery-thumbnail img, .owl-item img').length")
            print(f"Found {img_count} gallery images.")
        else:
            logger.error("Could not find any product link after scanning.")
            
        time.sleep(10)
        browser.close()

if __name__ == "__main__":
    debug_pdp()
