import pyautogui
import time
import subprocess

def run():
    print("Opening developers.facebook.com in Chrome...")
    # Open default browser to the URL
    subprocess.Popen(['cmd', '/c', 'start', 'chrome', 'https://developers.facebook.com/'])
    
    # Wait for the page to load
    print("Waiting for page to load...")
    time.sleep(5)
    
    print("Taking screenshot...")
    screenshot = pyautogui.screenshot()
    screenshot.save("E:\\aaacostco\\scraper\\fb_dev_screen.png")
    print("Screenshot saved to E:\\aaacostco\\scraper\\fb_dev_screen.png")

if __name__ == "__main__":
    run()
