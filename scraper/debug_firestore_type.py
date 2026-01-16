
import firebase_admin
from firebase_admin import credentials, firestore
from config import FIREBASE_CREDENTIALS
import os

if not firebase_admin._apps:
    cred = credentials.Certificate(FIREBASE_CREDENTIALS)
    firebase_admin.initialize_app(cred)

db = firestore.client()

# Fetch one product to inspect types
products_ref = db.collection(u'products').limit(1)
docs = products_ref.stream()

for doc in docs:
    data = doc.to_dict()
    print(f"Document ID: {doc.id}")
    if 'productId' in data:
        pid = data['productId']
        print(f"productId value: {pid}")
        print(f"productId type: {type(pid)}")
    else:
        print("productId field not found!")
