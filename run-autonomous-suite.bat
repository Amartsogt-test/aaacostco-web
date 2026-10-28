@echo off
chcp 65001 >nul
REM ============================================================
REM  Costco.mn - Full Autonomous Suite (Self-Heal + Auto-Cart + AI Marketing/Reels)
REM ============================================================
cd /d "%~dp0"
if not exist logs mkdir logs

echo [1/3] Running Autonomous Self-Healing Doctor...
call npm run core:self-heal

echo [2/3] Running Autonomous Order Aggregator ^& Costco.co.kr Auto-Cart Plan...
call npm run core:auto-cart

echo [3/3] Running Autonomous AI Marketing ^& Video Studio...
call npm run marketing:daily

echo ============================================================
echo  Autonomous Suite Completed! Reports saved in logs\ and output\marketing\
echo ============================================================
