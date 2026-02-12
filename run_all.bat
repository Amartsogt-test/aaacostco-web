@echo off
echo ============================================
echo  COSTCO FULL PRODUCT SCAN (ALL CATEGORIES)
echo  Warning: This will take a long time.
echo ============================================

call node scripts/generate-all.cjs

echo.
echo ============================================
echo  Scan Complete. Starting AI Maintenance...
echo ============================================

echo.
echo [1/5] Running Translation Fixes...
call node scripts/fix-translations.cjs

echo.
echo [2/5] Generating Descriptions...
call node scripts/generate-descriptions.cjs

echo.
echo [3/5] Fixing Weights...
call node scripts/fix-weights.cjs

echo.
echo [4/5] Retrying Unfixable Items...
call node scripts/retry-unfixable.cjs

echo.
echo [5/5] Generating Final Report...
call node scripts/generate-maintenance-report.cjs

echo.
echo ============================================
echo  ALL TASKS COMPLETED SUCCESSFULLY!
echo  Check maintenance_report.md for details.
echo ============================================
pause
