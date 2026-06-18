import time
import logging
from playwright.sync_api import sync_playwright

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

URL = "https://www.costco.co.kr/Electronics/c/cos_1"

def discover():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, slow_mo=1000)
        page = browser.new_page()
        page.goto(URL, timeout=60000, wait_until="domcontentloaded")
        
        logger.info("Waiting for page load...")
        time.sleep(10) # Give it plenty of time to render
        
        # Execute JS to find price elements and traverse up
        logger.info("Inspecting DOM for '원' (Price)...")
        
        results = page.evaluate("""() => {
            const all = document.querySelectorAll('*');
            const hits = [];
            
            for (const el of all) {
                if (el.innerText && el.children.length === 0 && el.innerText.includes('원')) {
                    // Found a price leaf node
                    let parent = el.parentElement;
                    let structure = el.tagName.toLowerCase();
                    if(el.className && typeof el.className === 'string') structure += "." + el.className.split(' ').join('.');
                    
                    // Traverse up 5 levels
                    for(let i=0; i<5; i++) {
                        if(!parent) break;
                        let tag = parent.tagName.toLowerCase();
                        if(parent.className && typeof parent.className === 'string') {
                             tag += "." + parent.className.split(' ').join('.');
                        }
                        structure = tag + " > " + structure;
                        parent = parent.parentElement;
                    }
                    hits.push(structure);
                }
            }
            return hits;
        }""")
        
        # Save full text to check if content exists
        with open("debug_text.txt", "w", encoding="utf-8") as f:
            f.write(page.inner_text("body"))
        
        print("\n" + "="*50)
        print(f"FOUND {len(results)} POTENTIAL PRICE ELEMENTS:")
        for r in list(set(results))[:20]: # Show unique ones
            print(f"  {r}")
        print("="*50 + "\n")
        
        # Also try to find product names (usually contain 'TV', 'Apple', etc)
        logger.info("Inspecting DOM for 'TV'...")
        results_tv = page.evaluate("""() => {
            const all = document.querySelectorAll('a');
            const hits = [];
            for (const el of all) {
                if (el.innerText.includes('TV') || el.innerText.includes('Apple')) {
                    hits.push(el.className);
                }
            }
            return hits;
        }""")
        print(f"Found Links with 'TV'/'Apple': {list(set(results_tv))}")

        browser.close()

if __name__ == "__main__":
    discover()
