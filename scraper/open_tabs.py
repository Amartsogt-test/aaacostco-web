import webbrowser
import time

def run():
    print("Opening costco.mn in a new tab of the default browser...")
    webbrowser.open_new_tab("https://costco.mn")
    
    # Wait a tiny bit before opening the next to ensure order and avoid overriding
    time.sleep(1)
    
    print("Opening costco.co.kr in a new tab...")
    webbrowser.open_new_tab("https://www.costco.co.kr")
    
    print("Done!")

if __name__ == "__main__":
    run()
