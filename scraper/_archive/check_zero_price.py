from firebase_admin import credentials, firestore, initialize_app
import os

# Use existing credentials
curr_dir = os.path.dirname(os.path.abspath(__file__))
cred_path = os.path.join(curr_dir, '..', 'functions', 'service-account.json')
if not os.path.exists(cred_path):
    print(f"Cred path {cred_path} not found.")
    exit(1)

try:
    app = initialize_app(credentials.Certificate(cred_path))
except ValueError:
    # Already initialized
    from firebase_admin import get_app
    app = get_app()

db = firestore.client()

print("Checking for products with 0 price...")

# 1. Check main 'products' collection
collection_ref = db.collection('products')
# Note: Queries with OR conditions are tricky in admin SDK without multiple queries
# We'll fetch all active/inactive (not deleted) and check in python for flexibility
# or use multiple queries.
# Let's try fetching all active ones first, as those are what users see.

# Optimization: Use 'status' == 'active' filter if possible, or just scan recent ones.
# Given potential size, let's stream all and count.

docs = collection_ref.stream()

count_zero = 0
zero_products = []

for doc in docs:
    data = doc.to_dict()
    product_id = doc.id
    name = data.get('name', 'N/A')
    
    # Check various price fields
    price = data.get('price', 0)
    price_krw = data.get('priceKRW', 0)
    
    # Logic: If BOTH are 0 or missing, it's a zero price product.
    # Sometimes price is string '0' or '0,000'
    
    def parse_price(p):
        if isinstance(p, (int, float)):
            return float(p)
        if isinstance(p, str):
            clean = p.replace(',', '').strip()
            if not clean: return 0.0
            try:
                return float(clean)
            except:
                return 0.0
        return 0.0

    p_val = parse_price(price)
    p_krw_val = parse_price(price_krw)

    if p_val == 0 and p_krw_val == 0:
        count_zero += 1
        status = data.get('status', 'unknown')
        zero_products.append(f"[{status}] {product_id}: {name}")

print(f"Found {count_zero} products with 0 price.")
if count_zero > 0:
    print("Example products:")
    for p in zero_products[:20]:
        print(p)
