import os
from dotenv import load_dotenv

load_dotenv()

# Firebase Config
FIREBASE_CREDENTIALS = os.path.join(os.path.dirname(__file__), '..', 'functions', 'service-account.json')
FIREBASE_STORAGE_BUCKET = 'costco-fe034.appspot.com'

# Costco Config
COSTCO_USER = os.getenv('COSTCO_USER')
COSTCO_PASS = os.getenv('COSTCO_PASS')

# Translation Config
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')  # For AI translation

# Scraping Config
HEADLESS = True  # Set to True for production
SLOW_MO = 500  # Milliseconds delay for human-like behavior

# Pricing Config (User Configurable)
EXCHANGE_RATE = 2.55       # KRW to MNT
MARGIN_MULTIPLIER = 1.15   # 15% Margin
SHIPPING_PER_KG = 3000     # MNT per KG
DEFAULT_WEIGHT_ESTIMATE = 1.0 # Default weight if unknown
