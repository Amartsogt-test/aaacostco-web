@echo off
echo ============================================
echo   FIXING GITHUB SECRET ERROR
echo ============================================

echo [1/4] Unstaging sensitive files...
git reset

echo [2/4] Removing service-account.json from tracking (but keeping local file)...
git rm --cached functions/service-account.json
git rm --cached functions\service-account.json

echo [3/4] Re-adding safe files...
git add .

echo [4/4] Committing and Pushing...
git commit -m "Update daily scripts with AI pipeline (Safe Push)"
git push

echo.
echo ============================================
echo   FIX COMPLETE!
echo ============================================
pause
