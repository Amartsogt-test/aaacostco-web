import pandas as pd
import os

DB_FILE = "products_db.xlsx"

# ID found: 688951
new_row = {"WooID": 0, "CostcoCode": 688951, "Name": "Braun Series 8 Electric Shaver 8663cc"}

if os.path.exists(DB_FILE):
    df = pd.read_excel(DB_FILE)
    # Check if already exists
    if 688951 in df['CostcoCode'].values:
        print("Product 688951 already exists in DB.")
    else:
        # Append
        df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)
        df.to_excel(DB_FILE, index=False)
        print("Added product 688951 to DB.")
else:
    # Create new
    df = pd.DataFrame([new_row])
    df.to_excel(DB_FILE, index=False)
    print("Created DB and added product 688951.")
