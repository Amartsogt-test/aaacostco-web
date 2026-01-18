@echo off
echo ============================================
echo   UPDATING GITHUB REPOSITORY
echo ============================================
echo.

echo [1/3] Adding changes...
git add .

echo [2/3] Committing changes...
git commit -m "Update daily scripts with AI pipeline (Weights, Translations, Descriptions)"

echo [3/3] Pushing to GitHub...
git push

echo.
echo ============================================
echo   UPDATE COMPLETE!
echo ============================================
pause
