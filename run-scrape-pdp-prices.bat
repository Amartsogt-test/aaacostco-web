@echo off
REM Scrape prices from the product PAGE (PDP) for hidden-price items with no warehouse
REM price. Opens a browser — log into costco.co.kr as a MEMBER if prompted.
cd /d E:\aaacostco

echo ============================================================
echo  Scrape PDP prices - started %date% %time%
echo  (Browser nees -> costco.co.kr-d GISHUUNEEREE neverne uu)
echo ============================================================
echo.

node scripts/core/scrape-pdp-prices.js

echo.
echo ============================================================
echo  Finished: %date% %time%
echo  Daraa ni:  npm run core:search-index ^&^& firebase deploy --only hosting
echo ============================================================
pause
