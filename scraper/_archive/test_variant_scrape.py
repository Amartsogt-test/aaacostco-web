from costco_bot import CostcoScraper
import logging

# Setup basic logging to see output
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_scrape():
    bot = CostcoScraper()
    bot.start()
    
    # URL for Aveeno Lotion
    url = "https://www.costco.co.kr/p/659217"
    
    logger.info(f"Testing scrape for: {url}")
    try:
        images, options, variants, pid, unit_price = bot.scrape_product_detail(url)
        
        print("\n--- SCRAPE RESULTS ---")
        print(f"Product ID: {pid}")
        print(f"Options Found: {len(options)}")
        print(f"Variants Found: {len(variants)}")
        
        import json
        if options:
            print("Options Data:", json.dumps(options, indent=2, ensure_ascii=False))
        if variants:
            print("Variants Data:", json.dumps(variants, indent=2, ensure_ascii=False))
            
    except Exception as e:
        logger.error(f"Scrape failed: {e}")
    finally:
        bot.close()

if __name__ == "__main__":
    test_scrape()
