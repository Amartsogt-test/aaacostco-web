@echo off
REM ============================================================
REM  Costco.mn - WEEKLY MAINTENANCE  (run once a week)
REM  The ONE script. Does everything, in order:
REM    1. Refresh Costco member cookie (log in if the browser asks)
REM    2. Full product sync  (scrape, prices, translate, weights, snapshot, report)
REM    3. Maintenance pass    (warehouse-price fallback + mark gone items inactive)
REM    4. Menu categories     (make catalog-only codes browsable: tires, etc.)
REM    5. Rebuild home snapshot (menu list + category counts, incl. the new ones)
REM    6. Rebuild search index
REM    7. Deploy hosting
REM  `call` is used so one failing step never aborts the rest.
REM  (Optional, separate & manual: run-scrape-pdp-prices for hidden-price items
REM   that have no warehouse value — it is slow and needs a member browser login.)
REM ============================================================
cd /d E:\aaacostco
if not exist logs mkdir logs
echo. >> logs\weekly.log
echo ===== WEEKLY %date% %time% ===== >> logs\weekly.log

echo [1/7] Refreshing Costco cookie (log in as MEMBER if prompted)...
call npm run refresh-cookie

echo [2/7] Full product sync (the long step)...
call npm run core:daily

echo [3/7] Maintenance: warehouse-price fallback + mark missing inactive...
node scripts/maintenance.cjs >> logs\weekly.log 2>&1

echo [4/7] Menu categories: make catalog-only codes browsable (tires, innerwear, batteries)...
node scripts/add-menu-categories.cjs >> logs\weekly.log 2>&1

echo [5/7] Rebuilding home snapshot (menu list + category counts)...
call npm run core:home-snapshot

echo [6/7] Rebuilding search index...
call npm run core:search-index

echo [7/7] Building and deploying hosting...
call npm run build
call firebase deploy --only hosting

echo.
echo ============================================================
echo  Weekly maintenance finished: %date% %time%   (log: logs\weekly.log)
echo ============================================================
pause
