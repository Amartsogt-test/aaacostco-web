
from fast_scraper import init_firebase

def count_docs():
    db = init_firebase()
    if not db: return
    
    coll = db.collection('products')
    docs = list(coll.list_documents())
    print(f"Total documents in 'products': {len(docs)}")
    
    if len(docs) > 0:
        doc = docs[0].get()
        data = doc.to_dict()
        print(f"Sample Doc ID: {doc.id}")
        print("Keys:", list(data.keys()))
        if 'updatedAt' in data:
            print(f"updatedAt: {data['updatedAt']} (Type: {type(data['updatedAt'])})")
        else:
            print("updatedAt: MISSING")
            
        if 'createdAt' in data:
            print(f"createdAt: {data['createdAt']} (Type: {type(data['createdAt'])})")
        else:
            print("createdAt: MISSING")

if __name__ == "__main__":
    count_docs()
