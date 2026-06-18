@echo off
REM ============================================================
REM  Costco.mn - daily product sync (auto)
REM  Runs the full product update pipeline.
REM  Scheduled via Windows Task Scheduler, daily at 10:00.
REM ============================================================
cd /d E:\aaacostco
if not exist logs mkdir logs

echo.                                                            >> logs\daily-sync.log
echo ============================================================ >> logs\daily-sync.log
echo  Sync started: %date% %time%                                >> logs\daily-sync.log
echo ============================================================ >> logs\daily-sync.log

call npm run core:sync          >> logs\daily-sync.log 2>&1
call npm run core:tags          >> logs\daily-sync.log 2>&1
call npm run core:host-images   >> logs\daily-sync.log 2>&1
call npm run core:weight        >> logs\daily-sync.log 2>&1
call npm run core:home-weights  >> logs\daily-sync.log 2>&1
call npm run core:translate     >> logs\daily-sync.log 2>&1
call npm run core:fix-translations >> logs\daily-sync.log 2>&1
node scripts\generate-daily.cjs >> logs\daily-sync.log 2>&1
call npm run core:search-index  >> logs\daily-sync.log 2>&1
call npm run core:home-snapshot >> logs\daily-sync.log 2>&1
call npm run core:report        >> logs\daily-sync.log 2>&1
call npm run core:bank-rates    >> logs\daily-sync.log 2>&1

echo ----- Sync finished: %date% %time% -----                   >> logs\daily-sync.log
