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

echo.
echo ============================================
echo   ALL TASKS COMPLETED!
echo   %time%
echo ============================================
pause
