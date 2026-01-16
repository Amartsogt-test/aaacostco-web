import threading
import time
import logging
from datetime import datetime
import firebase_admin
from firebase_admin import credentials, firestore
from playwright.sync_api import sync_playwright
from config import FIREBASE_CREDENTIALS, HEADLESS, SLOW_MO

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class GolomtBot:
    def __init__(self):
        self.playwright = None
        self.browser = None
        self.page = None
        self.db = None

    def init_firebase(self):
        if not firebase_admin._apps:
            cred = credentials.Certificate(FIREBASE_CREDENTIALS)
            firebase_admin.initialize_app(cred)
        self.db = firestore.client()
        logger.info("Firebase initialized.")

    def start_browser(self):
        self.playwright = sync_playwright().start()
        # Headless mode can be set to False for debugging
        self.browser = self.playwright.chromium.launch(headless=HEADLESS, slow_mo=SLOW_MO)
        self.page = self.browser.new_page(
            viewport={'width': 1280, 'height': 800},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )

    def fetch_rate(self):
        url = "https://www.golomtbank.com/exchange"
        logger.info(f"Navigating to {url}...")
        self.page.goto(url)
        
        # Wait for table to load
        try:
            self.page.wait_for_selector("table", timeout=15000)
            logger.info("Table found. Searching for KRW...")
        except:
            logger.error("Table not found or page took too long.")
            return None

        # Analyze rows
        # We look for a row containing 'KRW' or 'СОЛОНГОС'
        # The structure is assumed to be: 
        # Currency | Code | Official | Cash Buy | Cash Sell | ...
        
        # Eval script to extract data cleanly
        rate_data = self.page.evaluate("""() => {
            const rows = Array.from(document.querySelectorAll('tr'));
            for (const row of rows) {
                if (row.innerText.includes('KRW') || row.innerText.includes('СОЛОНГОС')) {
                    const cols = Array.from(row.querySelectorAll('td'));
                    const texts = cols.map(c => c.innerText.trim());
                    
                    // indices based on inspection:
                    // 3: Official (2.44)
                    // 4: Non-Cash Buy (2.39)
                    // 5: Non-Cash Sell (2.51)
                    // 6: Cash Buy (2.33)
                    // 7: Cash Sell (2.57)
                    
                    if (cols.length >= 8) {
                        return {
                            found: true,
                            full_row: texts,
                            rates: {
                                'official': texts[3],
                                'nonCashBuy': texts[4],
                                'nonCashSell': texts[5],
                                'cashBuy': texts[6],
                                'cashSell': texts[7]
                            }
                        };
                    }
                }
            }
            return { found: false };
        }""")

        if rate_data and rate_data['found']:
            raw_rates = rate_data['rates']
            logger.info(f"✅ Golomt Row found: {rate_data['full_row']}")
            logger.info(f"Extracted Rates: {raw_rates}")
            
            try:
                # Clean up and convert all rates
                clean_rates = {}
                for key, val in raw_rates.items():
                    clean_rates[key] = float(str(val).replace(',', '').strip())
                
                return clean_rates
            except ValueError as e:
                logger.error(f"Failed to parse one of the rates: {e} | Raw: {raw_rates}")
                return None
        else:
            logger.warning("KRW row not found in the table.")
            return None


    def fetch_tdbm_rates(self):
        url = "https://www.tdbm.mn/mn/exchange-rates"
        logger.info(f"Navigating to {url}...")
        try:
            self.page.goto(url, timeout=30000)
            self.page.wait_for_selector("table", timeout=15000)
        except Exception as e:
            logger.error(f"Failed to load TDBM page: {e}")
            return None

        # Eval script for TDBM
        rate_data = self.page.evaluate("""() => {
            const rows = Array.from(document.querySelectorAll('tr'));
            for (const row of rows) {
                const cols = Array.from(row.querySelectorAll('td'));
                const texts = cols.map(c => c.innerText.trim());
                
                // TDBM Structure based on inspection:
                // 1: Code (KRW)
                // 3: Official
                // 4: Non-Cash Buy
                // 5: Non-Cash Sell
                // 6: Cash Buy
                // 7: Cash Sell
                
                if (texts.length >= 8 && texts[1] === 'KRW') {
                    return {
                        found: true,
                        full_row: texts,
                        rates: {
                            'official': texts[3],
                            'cashBuy': texts[6],
                            'cashSell': texts[7],
                            'nonCashBuy': texts[4],
                            'nonCashSell': texts[5]
                        }
                    };
                }
            }
            return { found: false };
        }""")

        if rate_data and rate_data['found']:
            raw_rates = rate_data['rates']
            logger.info(f"✅ TDBM Row found: {rate_data['full_row']}")
            
            try:
                clean_rates = {}
                for key, val in raw_rates.items():
                    clean_rates[key] = float(str(val).replace(',', '').strip())
                return clean_rates
            except ValueError as e:
                logger.error(f"Failed to parse TDBM rates: {e}")
                return None
        else:
            logger.warning("KRW row not found in TDBM table.")
            return None

    def fetch_khan_rates(self):
        today = datetime.now().strftime('%Y-%m-%d')
        url = f"https://www.khanbank.com/api/back/rates?date={today}"
        logger.info(f"Fetching Khan Bank rates via Browser API fetch: {url}")
        
        try:
            # We use page.evaluate to perform the fetch from within the browser.
            # This bypasses local SSL certificate issues on the host OS.
            data = self.page.evaluate(f"""async () => {{
                const response = await fetch('{url}');
                return await response.json();
            }}""")
            
            if not data:
                logger.warning("Empty response from Khan Bank API.")
                return None
                
            # Find KRW
            krw_data = next((r for r in data if r.get('currency') == 'KRW'), None)
            
            if not krw_data:
                available = [r.get('currency') for r in data if r.get('currency')]
                logger.warning(f"KRW not found in Khan Bank API response. Available: {available}")
                return None
                
            logger.info(f"✅ Khan Bank API Data found: {krw_data}")
            
            return {
                'official': float(krw_data.get('midRate', 0)),
                'cashBuy': float(krw_data.get('cashBuyRate', 0)),
                'cashSell': float(krw_data.get('cashSellRate', 0)),
                'nonCashBuy': float(krw_data.get('buyRate', 0)),
                'nonCashSell': float(krw_data.get('sellRate', 0))
            }
            
        except Exception as e:
            logger.error(f"Failed to fetch Khan Bank rates via Browser API: {e}")
            return None

    def update_database(self, golomt_rates, tdb_rates, khan_rates):
        if not self.db:
            self.init_firebase()
            
        logger.info(f"Updating Firestore... Golomt: {golomt_rates}, TDB: {tdb_rates}, Khan: {khan_rates}")
        
        try:
            doc_ref = self.db.collection('settings').document('currency')
            current_doc = doc_ref.get()
            
            update_data = {
                'updatedAt': firestore.SERVER_TIMESTAMP,
                'updatedBy': 'GolomtBot'
            }

            # Handle Previous Day Logic
            if current_doc.exists:
                data = current_doc.to_dict()
                last_updated = data.get('updatedAt')
                
                # Check if we should archive current rates as "previous"
                should_update_prev = True
                if last_updated:
                    # last_updated is a datetime object with timezone
                    # We compare dates in local time or UTC. Simple approach:
                    # If last update was NOT today, then what is currently in DB is from "yesterday" (or older).
                    # So we save it as 'previous'.
                    today_str = datetime.now().strftime('%Y-%m-%d')
                    last_date_str = last_updated.strftime('%Y-%m-%d') if hasattr(last_updated, 'strftime') else ''
                    
                    if last_date_str == today_str:
                        should_update_prev = False
                        logger.info(f"Update is same day ({today_str}). Keeping existing previous rates.")

                if should_update_prev:
                    logger.info("First update of the day (or new data). Archiving current rates to previous.")
                    if data.get('golomtRates'): update_data['previousGolomtRates'] = data.get('golomtRates')
                    if data.get('tdbRates'): update_data['previousTdbRates'] = data.get('tdbRates')
                    if data.get('khanRates'): update_data['previousKhanRates'] = data.get('khanRates')

            if golomt_rates:
                update_data['golomtRates'] = golomt_rates
            
            if tdb_rates:
                update_data['tdbRates'] = tdb_rates
                
            if khan_rates:
                update_data['khanRates'] = khan_rates

            doc_ref.set(update_data, merge=True)
            
            # Add to history as well
            history_ref = doc_ref.collection('history')
            history_ref.add({
                'golomt': golomt_rates,
                'tdb': tdb_rates,
                'khan': khan_rates,
                'date': firestore.SERVER_TIMESTAMP,
                'user': 'GolomtBot'
            })
            
            logger.info("Database update successful.")
            return True
        except Exception as e:
            logger.error(f"Firestore update failed: {e}")
            return False

    def listen(self):
        if not self.db:
            self.init_firebase()
            
        logger.info("🎧 Listening for remote commands on settings/currency...")

        def on_snapshot(doc_snapshot, changes, read_time):
            # Try to get data whether it's a list or single object
            doc = None
            if isinstance(doc_snapshot, list) and len(doc_snapshot) > 0:
                doc = doc_snapshot[0]
            elif hasattr(doc_snapshot, 'exists'):
                doc = doc_snapshot
                
            if not doc or not doc.exists:
                logger.warning("Snapshot received but document does not exist or empty.")
                return
                
            data = doc.to_dict()
            logger.info(f"--- Snapshot Event Received --- (Trigger: {data.get('refreshTrigger')})")
            
            if data and data.get('refreshTrigger') is True:
                logger.info("🚀 COMMAND RECEIVED: Refresh Triggered!")
                
                # 1. Reset trigger
                doc.reference.update({'refreshTrigger': False})
                
                # 2. Run Scraping
                try:
                    self.start_browser()
                    
                    logger.info("--- STARTING FETCH ---")
                    
                    logger.info("1/3: Fetching Golomt...")
                    golomt = self.fetch_rate()
                    if golomt: logger.info("✅ Golomt Done")
                    else: logger.warning("❌ Golomt Failed")
                    
                    logger.info("2/3: Fetching TDBM...")
                    tdb = self.fetch_tdbm_rates()
                    if tdb: logger.info("✅ TDBM Done")
                    else: logger.warning("❌ TDBM Failed")
                    
                    logger.info("3/3: Fetching Khan...")
                    khan = self.fetch_khan_rates()
                    if khan: logger.info("✅ Khan Done")
                    else: logger.warning("❌ Khan Failed")
                    
                    logger.info("Updating Database...")
                    self.update_database(golomt, tdb, khan)
                    logger.info("--- ALL DONE ---")
                    
                except Exception as e:
                    logger.error(f"Error during remote execution: {e}")
                    import traceback
                    logger.error(traceback.format_exc())
                finally:
                    if self.browser: self.browser.close()
                    if self.playwright: 
                        self.playwright.stop()
                        self.playwright = None
                            
        doc_ref = self.db.collection('settings').document('currency')
        doc_watch = doc_ref.on_snapshot(on_snapshot)
        
        try:
            while True:
                # Add a periodic log so user knows it hasn't crashed
                logger.info("💓 Heartbeat: Bot is still listening...")
                time.sleep(30)
        except KeyboardInterrupt:
            logger.info("Stopping listener...")

    def run(self):
        import sys
        if len(sys.argv) > 1 and sys.argv[1] == '--listen':
            self.listen()
        else:
            try:
                self.start_browser()
                golomt = self.fetch_rate()
                tdb = self.fetch_tdbm_rates()
                khan = self.fetch_khan_rates()
                self.update_database(golomt, tdb, khan)
            except Exception as e:
                logger.error(f"Bot crash: {e}")
            finally:
                if self.browser: self.browser.close()
                if self.playwright: self.playwright.stop()

if __name__ == "__main__":
    import threading
    bot = GolomtBot()
    bot.run()
