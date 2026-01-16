import pandas as pd
import os

db_file = "products_db.xlsx"

if not os.path.exists(db_file):
    data = {
        "WooID": [101, 102],
        "CostcoCode": [637620, 653211]
    }
    df = pd.DataFrame(data)
    try:
        df.to_excel(db_file, index=False)
        print(f"✅ Created template {db_file}")
    except ImportError:
        print("❌ Error: openpyxl or pandas not installed correctly.")
    except Exception as e:
        print(f"❌ Error creating excel: {e}")
else:
    print(f"ℹ️ {db_file} already exists.")
