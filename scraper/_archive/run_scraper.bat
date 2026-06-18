@echo off
cd /d "c:\Users\Batbileg\_Costco\scraper"
echo Starting Costco Scraper at %date% %time% >> scraper_log.txt
py costco_bot.py >> scraper_log.txt 2>&1
echo Finished at %date% %time% >> scraper_log.txt
echo ---------------------------------------- >> scraper_log.txt
