@echo off
echo ============================================
echo   COSTCO DAILY UPDATE SCRIPT
echo   %date% %time%
echo ============================================
echo.

cd /d d:\a\aaacostco

echo [1/2] Running npm run core:daily...
echo ----------------------------------------
call npm run core:daily
echo.
echo [2/2] Running AI Daily Pipeline (Weights, Translations, Descriptions)...
echo ----------------------------------------
// call node scripts/generate-daily.cjs
// (Commented out by default to prevent accidental quota usage, uncomment to enable)
call node scripts/generate-daily.cjs

echo.

echo.
echo ============================================
echo   ALL TASKS COMPLETED!
echo   %time%
echo ============================================
pause
