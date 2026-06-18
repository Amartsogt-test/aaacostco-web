import pandas as pd

data = {
    "WooID": [0], # 0 or empty for test
    "CostcoCode": [1785779] # Bose Headphones
}
df = pd.DataFrame(data)
df.to_excel("products_db.xlsx", index=False)
print("✅ Created products_db.xlsx with Bose Headphones (1785779)")
