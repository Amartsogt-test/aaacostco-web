import pyautogui
import time

def run():
    print("Taking screenshot...")
    screenshot = pyautogui.screenshot()
    screenshot.save("E:\\aaacostco\\scraper\\current_screen.png")
    print("Screenshot saved to E:\\aaacostco\\scraper\\current_screen.png")

if __name__ == "__main__":
    run()
