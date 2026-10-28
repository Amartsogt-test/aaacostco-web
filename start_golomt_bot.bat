@echo off
cd /d "%~dp0scraper"
echo Starting Golomt Bot...
py -3.11 golomt_bot.py --listen
pause
