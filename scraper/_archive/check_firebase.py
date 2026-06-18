from firebase_admin import credentials, firestore, initialize_app
import os

# Use existing credentials
curr_dir = os.path.dirname(os.path.abspath(__file__))
cred_path = os.path.join(curr_dir, '..', 'functions', 'service-account.json')
if not os.path.exists(cred_path):
    # Fallback to check common locations or ask
    print(f"Cred path {cred_path} not found.")
    exit(1)

cred = credentials.Certificate(cred_path)
initialize_app(cred)
db = firestore.client()

doc = db.collection('settings').document('currency').get()
if doc.exists:
    print(f"Data in settings/currency:\n{doc.to_dict()}")
else:
    print("Document settings/currency does not exist.")
