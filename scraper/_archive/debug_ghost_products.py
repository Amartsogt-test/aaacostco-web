import firebase_admin
from firebase_admin import credentials, firestore
import os

# Initialize Firebase
if not firebase_admin._apps:
    cred_path = r"c:\Users\Batbileg\_Costco\functions\service-account.json"
    cred = credentials.Certificate(cred_path)
    firebase_admin.initialize_app(cred)

db = firestore.client()

def find_ghosts():
    ghost_terms = ["Tide", "Water", "Dyson", "MacBook", "Samsung", "Huggies"]
    products_ref = db.collection('products')
    
    print("Searching for potential ghost products...")
    
    # Scanning all products (inefficient but safe for small DBs)
    docs = products_ref.stream()
    
    found_count = 0
    for doc in docs:
        data = doc.to_dict()
        name = data.get('name', '')
        
        is_ghost = any(term in name for term in ghost_terms)
        
        if is_ghost:
            print(f"👻 FOUND GHOST: {doc.id} - {name}")
            found_count += 1

    print(f"Total potential ghost products found: {found_count}")

if __name__ == "__main__":
    find_ghosts()
