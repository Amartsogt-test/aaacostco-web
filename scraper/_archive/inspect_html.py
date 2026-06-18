
try:
    with open('debug_html.txt', 'r', encoding='utf-8') as f:
        content = f.read()

    print(f"File size: {len(content)} characters")

    queries = [
        'LG-HD-LED-TV'
    ]

    for q in queries:
        print(f"\n--- Searching for: {q} ---")
        idx = content.find(q)
        if idx != -1:
            start = max(0, idx - 500)
            end = min(len(content), idx + 2500)
            print(content[start:end])
        else:
            print("Not found")

except Exception as e:
    print(f"Error: {e}")
