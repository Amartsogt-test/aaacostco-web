
import sys
sys.stdout.reconfigure(encoding='utf-8')
print("Starting test...")
try:
    from fast_scraper import init_firebase
    print("Import fast_scraper successful")
    db = init_firebase()
    print("Init firebase successful")
except Exception as e:
    print(f"Error: {e}")
print("Done")
